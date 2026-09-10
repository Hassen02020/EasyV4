import test from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { writeFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { MyGoDriver } from "../mygo/driver"
import { encodeMyGoSupplierToken } from "../mygo/mapper"
import type { MyGoClient } from "@/lib/mygo/client"
import type { MyGoConfig } from "@/lib/mygo/config"
import type { BookingConfirmationDTO, BookingCancellationDTO } from "@/lib/mygo/types"
import { MyGoAuthError, MyGoTimeoutError, MyGoNetworkError, MyGoSchemaError, MyGoApiError } from "@/lib/mygo"

/**
 * lib/mygo/config.ts::getMyGoConfig() met en cache son résultat au niveau
 * module (`let cached: MyGoConfig | null = null`) — comportement existant,
 * volontairement non modifié ici ("reuse, don't duplicate/redesign"). Une
 * fois résolue avec succès dans CE process, la config reste figée pour
 * tous les appels suivants, quels que soient les changements de
 * process.env — donc un seul scénario "succès" est fiable par process.
 * On garde ici le scénario réellement utilisé par cet environnement
 * (MYGO_MODE=virtual). Les scénarios "live sans/avec credentials" sont
 * testés dans un VRAI process enfant isolé ci-dessous, seule façon fiable
 * de les exercer sans modifier le cache existant.
 */

test("MyGoDriver.getConfigStatus : mode virtuel (crédentiels de test auto-remplies) -> CONFIGURED, jamais présenté comme réel", () => {
  process.env.MYGO_MODE = "virtual"
  const driver = new MyGoDriver()
  assert.equal(driver.getConfigStatus(), "CONFIGURED")
  assert.equal(driver.isVirtualMode(), true)
})

test("MyGoDriver.search : destinationId non numérique -> erreur explicite, jamais un cityId inventé", async () => {
  const driver = new MyGoDriver()
  await assert.rejects(
    () =>
      driver.search({
        destinationId: "not-a-city-id",
        checkIn: "2026-09-10",
        checkOut: "2026-09-13",
        rooms: [{ adults: 2 }],
        currency: "TND",
      }),
    /destinationId invalide/,
  )
})

test("MyGoDriver.search : repasse stars/onlyAvailable de la requête (PHASE 28 — auparavant ignorés/écrasés en dur)", async () => {
  const config: MyGoConfig = {
    mode: "live",
    login: "test-login",
    password: "test-password",
    baseUrl: "https://example.invalid/api/hotel",
    timeoutMs: 8000,
    maxRetries: 3,
    staticDataTtlSeconds: 86400,
    searchTtlSeconds: 300,
  }
  let capturedInput: { filters?: { categories?: number[]; onlyAvailable?: boolean } } | undefined
  const client = {
    searchHotels: async (input: unknown) => {
      capturedInput = input as typeof capturedInput
      return { hotels: [], searchId: "s1", count: 0 }
    },
  } as unknown as MyGoClient
  const driver = new MyGoDriver(client, config)

  await driver.search({
    destinationId: "10",
    checkIn: "2026-09-10",
    checkOut: "2026-09-13",
    rooms: [{ adults: 2 }],
    currency: "TND",
    stars: [4, 5],
    onlyAvailable: false,
  })

  assert.deepEqual(capturedInput?.filters?.categories, [4, 5])
  assert.equal(capturedInput?.filters?.onlyAvailable, false)
})

function runInIsolatedProcess(env: Record<string, string | undefined>): { status: string; isVirtual: boolean } {
  // Écrit un vrai fichier temporaire exécuté par tsx dans un process neuf
  // (importer le driver et imprimer son état en JSON sur stdout) — seule
  // façon fiable de contourner le cache module-level existant de
  // lib/mygo/config.ts sans le modifier. Écrit DANS le projet (pas /tmp)
  // pour que tsx résolve les alias "@/..." via le tsconfig.json du dépôt.
  const tmpFile = join(process.cwd(), `.p26-mygo-config-check-${Date.now()}-${Math.random().toString(36).slice(2)}.ts`)
  writeFileSync(
    tmpFile,
    `
import { MyGoDriver } from "./lib/hotel-suppliers/mygo/driver"
const driver = new MyGoDriver()
process.stdout.write(JSON.stringify({ status: driver.getConfigStatus(), isVirtual: driver.isVirtualMode() }))
`,
  )
  try {
    const out = execFileSync("npx", ["tsx", tmpFile], {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      encoding: "utf-8",
      timeout: 20_000,
    })
    return JSON.parse(out.trim())
  } finally {
    rmSync(tmpFile, { force: true })
  }
}

test("MyGoDriver.getConfigStatus (process isolé) : mode live sans MYGO_LOGIN/MYGO_PASSWORD -> NOT_CONFIGURED", () => {
  const result = runInIsolatedProcess({ MYGO_MODE: "live", MYGO_LOGIN: "", MYGO_PASSWORD: "" })
  assert.equal(result.status, "NOT_CONFIGURED")
  assert.equal(result.isVirtual, false)
})

test("MyGoDriver.getConfigStatus (process isolé) : mode live avec credentials présents -> CONFIGURED, mode réel jamais confondu avec virtuel", () => {
  const result = runInIsolatedProcess({ MYGO_MODE: "live", MYGO_LOGIN: "real-login", MYGO_PASSWORD: "real-password" })
  assert.equal(result.status, "CONFIGURED")
  assert.equal(result.isVirtual, false)
})

// ---------------------------------------------------------------------------
// checkRate / book / cancel — jusqu'ici uniquement vérifiés manuellement en
// live (voir rapport Phase 26, bug atHotel/totalPrice). Client MyGo mocké via
// l'injection de constructeur ajoutée en Phase 27 (configOverride/client) —
// aucun réseau, aucun Virtual Supplier, comportement 100% déterministe.
// ---------------------------------------------------------------------------

const TEST_CONFIG: MyGoConfig = {
  mode: "live",
  login: "test-login",
  password: "test-password",
  baseUrl: "https://example.invalid/api/hotel",
  timeoutMs: 8000,
  maxRetries: 3,
  staticDataTtlSeconds: 86400,
  searchTtlSeconds: 300,
}

const TEST_TOKEN = encodeMyGoSupplierToken({ cityId: 10, hotelId: 555, boardingId: 2, roomId: 99, searchToken: "search-tok" })

function mockClient(overrides: Partial<MyGoClient> = {}): MyGoClient {
  return {
    createBooking: async () => {
      throw new Error("createBooking not mocked for this test")
    },
    cancelBooking: async () => {
      throw new Error("cancelBooking not mocked for this test")
    },
    ...overrides,
  } as unknown as MyGoClient
}

test("MyGoDriver.checkRate : utilise confirmation.totalPrice (jamais .atHotel) comme prix faisant foi — régression du bug Phase 26", async () => {
  const confirmation: BookingConfirmationDTO = {
    bookingId: 1,
    rooms: [],
    currency: "TND",
    totalPrice: 1838.7,
    atHotel: 0, // scénario réel qui avait causé le bug : atHotel=0/undefined alors que le total réel est non nul
  }
  const client = mockClient({ createBooking: async () => confirmation })
  const driver = new MyGoDriver(client, TEST_CONFIG)

  const result = await driver.checkRate({
    supplier: "mygo",
    supplierHotelCode: "555",
    supplierRateCode: "rate-1",
    roomId: "99",
    supplierToken: TEST_TOKEN,
    checkIn: "2026-09-10",
    checkOut: "2026-09-13",
    rooms: [{ adults: 2 }],
    currency: "TND",
  })

  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.rate.netPrice, 1838.7)
    assert.equal(result.rate.sellingPrice, 1838.7)
  }
})

test("MyGoDriver.checkRate : indisponibilité fournisseur -> code NO_AVAILABILITY normalisé, jamais une exception brute", async () => {
  const client = mockClient({ createBooking: async () => { throw new Error("No availability for this room") } })
  const driver = new MyGoDriver(client, TEST_CONFIG)

  const result = await driver.checkRate({
    supplier: "mygo",
    supplierHotelCode: "555",
    supplierRateCode: "rate-1",
    roomId: "99",
    supplierToken: TEST_TOKEN,
    checkIn: "2026-09-10",
    checkOut: "2026-09-13",
    rooms: [{ adults: 2 }],
    currency: "TND",
  })

  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.code, "NO_AVAILABILITY")
})

test("MyGoDriver.checkRate : sans supplierToken -> erreur explicite immédiate, jamais un appel réseau", async () => {
  const driver = new MyGoDriver(mockClient(), TEST_CONFIG)
  const result = await driver.checkRate({
    supplier: "mygo",
    supplierHotelCode: "555",
    supplierRateCode: "rate-1",
    roomId: "99",
    checkIn: "2026-09-10",
    checkOut: "2026-09-13",
    rooms: [{ adults: 2 }],
    currency: "TND",
  })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.code, "SUPPLIER_ERROR")
})

test("MyGoDriver.book : utilise confirmation.totalPrice comme confirmedNetPrice (jamais .atHotel) — même régression que checkRate", async () => {
  const confirmation: BookingConfirmationDTO = {
    bookingId: 42,
    rooms: [],
    currency: "TND",
    totalPrice: 1838.7,
    atHotel: 0,
    state: "Validated",
  }
  const client = mockClient({ createBooking: async () => confirmation })
  const driver = new MyGoDriver(client, TEST_CONFIG)

  const result = await driver.book({
    supplier: "mygo",
    supplierHotelCode: "555",
    supplierRateCode: "rate-1",
    roomId: "99",
    supplierToken: TEST_TOKEN,
    checkIn: "2026-09-10",
    checkOut: "2026-09-13",
    currency: "TND",
    expectedNetPrice: 1838.7,
    travelers: [{ firstName: "Test", lastName: "Traveler", isHolder: true }],
    correlationId: "test-correlation-id",
  })

  assert.equal(result.outcome, "SUCCESS")
  if (result.outcome === "SUCCESS") {
    assert.equal(result.confirmedNetPrice, 1838.7)
    assert.equal(result.supplierBookingReference, "42")
    assert.equal(result.state, "CONFIRMED")
  }
})

test("MyGoDriver.book : erreur d'authentification fournisseur -> DEFINITIVE_FAILURE/AUTH_ERROR, jamais AMBIGUOUS (Phase 27.2)", async () => {
  const client = mockClient({ createBooking: async () => { throw new MyGoAuthError("Authentication failed") } })
  const driver = new MyGoDriver(client, TEST_CONFIG)

  const result = await driver.book({
    supplier: "mygo",
    supplierHotelCode: "555",
    supplierRateCode: "rate-1",
    roomId: "99",
    supplierToken: TEST_TOKEN,
    checkIn: "2026-09-10",
    checkOut: "2026-09-13",
    currency: "TND",
    expectedNetPrice: 1838.7,
    travelers: [{ firstName: "Test", lastName: "Traveler", isHolder: true }],
    correlationId: "test-correlation-id-2",
  })

  assert.equal(result.outcome, "DEFINITIVE_FAILURE")
  if (result.outcome === "DEFINITIVE_FAILURE") assert.equal(result.code, "AUTH_ERROR")
})

test("MyGoDriver.book : timeout fournisseur -> AMBIGUOUS/TIMEOUT — jamais un échec définitif, réservation peut-être créée (Phase 27.2)", async () => {
  const client = mockClient({ createBooking: async () => { throw new MyGoTimeoutError(5000) } })
  const driver = new MyGoDriver(client, TEST_CONFIG)

  const result = await driver.book({
    supplier: "mygo",
    supplierHotelCode: "555",
    supplierRateCode: "rate-1",
    roomId: "99",
    supplierToken: TEST_TOKEN,
    checkIn: "2026-09-10",
    checkOut: "2026-09-13",
    currency: "TND",
    expectedNetPrice: 1838.7,
    travelers: [{ firstName: "Test", lastName: "Traveler", isHolder: true }],
    correlationId: "test-correlation-id-timeout",
  })

  assert.equal(result.outcome, "AMBIGUOUS")
  if (result.outcome === "AMBIGUOUS") assert.equal(result.code, "TIMEOUT")
})

test("MyGoDriver.book : un timeout AMBIGUOUS n'appelle createBooking qu'UNE SEULE FOIS — aucun second BOOK en aveugle (Phase 27.2)", async () => {
  let createBookingCalls = 0
  const client = mockClient({
    createBooking: async () => {
      createBookingCalls++
      throw new MyGoTimeoutError(5000)
    },
  })
  const driver = new MyGoDriver(client, TEST_CONFIG)

  const result = await driver.book({
    supplier: "mygo",
    supplierHotelCode: "555",
    supplierRateCode: "rate-1",
    roomId: "99",
    supplierToken: TEST_TOKEN,
    checkIn: "2026-09-10",
    checkOut: "2026-09-13",
    currency: "TND",
    expectedNetPrice: 1838.7,
    travelers: [{ firstName: "Test", lastName: "Traveler", isHolder: true }],
    correlationId: "test-correlation-id-no-blind-retry",
  })

  assert.equal(result.outcome, "AMBIGUOUS")
  assert.equal(createBookingCalls, 1, "book() ne doit JAMAIS retenter createBooking lui-même après un état ambigu")
})

test("MyGoDriver.book : un résultat SUCCESS ne contient AUCUN champ credential/config — surface exactement le contrat Hub (Phase 27.2)", async () => {
  const confirmation: BookingConfirmationDTO = {
    bookingId: 42,
    rooms: [],
    currency: "TND",
    totalPrice: 1838.7,
    atHotel: 0,
    state: "Validated",
  }
  const client = mockClient({ createBooking: async () => confirmation })
  const driver = new MyGoDriver(client, TEST_CONFIG)

  const result = await driver.book({
    supplier: "mygo",
    supplierHotelCode: "555",
    supplierRateCode: "rate-1",
    roomId: "99",
    supplierToken: TEST_TOKEN,
    checkIn: "2026-09-10",
    checkOut: "2026-09-13",
    currency: "TND",
    expectedNetPrice: 1838.7,
    travelers: [{ firstName: "Test", lastName: "Traveler", isHolder: true }],
    correlationId: "test-correlation-id-no-leak",
  })

  assert.deepEqual(
    new Set(Object.keys(result)),
    new Set(["outcome", "supplierBookingReference", "confirmedNetPrice", "currency", "state", "hotelId"]),
  )
})

test("MyGoDriver.book : erreur réseau fournisseur -> AMBIGUOUS/NETWORK_ERROR (Phase 27.2)", async () => {
  const client = mockClient({ createBooking: async () => { throw new MyGoNetworkError("ECONNRESET") } })
  const driver = new MyGoDriver(client, TEST_CONFIG)

  const result = await driver.book({
    supplier: "mygo",
    supplierHotelCode: "555",
    supplierRateCode: "rate-1",
    roomId: "99",
    supplierToken: TEST_TOKEN,
    checkIn: "2026-09-10",
    checkOut: "2026-09-13",
    currency: "TND",
    expectedNetPrice: 1838.7,
    travelers: [{ firstName: "Test", lastName: "Traveler", isHolder: true }],
    correlationId: "test-correlation-id-network",
  })

  assert.equal(result.outcome, "AMBIGUOUS")
  if (result.outcome === "AMBIGUOUS") assert.equal(result.code, "NETWORK_ERROR")
})

test("MyGoDriver.book : réponse malformée fournisseur -> AMBIGUOUS/MALFORMED_RESPONSE, jamais classé comme définitif (Phase 27.2)", async () => {
  const client = mockClient({ createBooking: async () => { throw new MyGoSchemaError("createBooking", ["totalPrice manquant"]) } })
  const driver = new MyGoDriver(client, TEST_CONFIG)

  const result = await driver.book({
    supplier: "mygo",
    supplierHotelCode: "555",
    supplierRateCode: "rate-1",
    roomId: "99",
    supplierToken: TEST_TOKEN,
    checkIn: "2026-09-10",
    checkOut: "2026-09-13",
    currency: "TND",
    expectedNetPrice: 1838.7,
    travelers: [{ firstName: "Test", lastName: "Traveler", isHolder: true }],
    correlationId: "test-correlation-id-malformed",
  })

  assert.equal(result.outcome, "AMBIGUOUS")
  if (result.outcome === "AMBIGUOUS") assert.equal(result.code, "MALFORMED_RESPONSE")
})

test("MyGoDriver.book : indisponibilité fournisseur -> DEFINITIVE_FAILURE/NO_AVAILABILITY, jamais ambigu (Phase 27.2)", async () => {
  const client = mockClient({ createBooking: async () => { throw new MyGoApiError("createBooking", 400, "No availability for this room") } })
  const driver = new MyGoDriver(client, TEST_CONFIG)

  const result = await driver.book({
    supplier: "mygo",
    supplierHotelCode: "555",
    supplierRateCode: "rate-1",
    roomId: "99",
    supplierToken: TEST_TOKEN,
    checkIn: "2026-09-10",
    checkOut: "2026-09-13",
    currency: "TND",
    expectedNetPrice: 1838.7,
    travelers: [{ firstName: "Test", lastName: "Traveler", isHolder: true }],
    correlationId: "test-correlation-id-no-avail",
  })

  assert.equal(result.outcome, "DEFINITIVE_FAILURE")
  if (result.outcome === "DEFINITIVE_FAILURE") assert.equal(result.code, "NO_AVAILABILITY")
})

test("MyGoDriver.reconcileBooking : une seule réservation correspondante récente -> FOUND, jamais un second BOOK nécessaire (Phase 27.2)", async () => {
  const client = mockClient({
    listBookings: async () =>
      [
        {
          Id: 777,
          Hotel: { Id: 555 },
          CheckIn: "2026-09-10",
          CheckOut: "2026-09-13",
          State: "Validated",
          Created: new Date().toISOString(),
          Currency: "TND",
          TotalPrice: 1838.7,
          Rooms: [],
        },
      ] as unknown as Awaited<ReturnType<MyGoClient["listBookings"]>>,
  })
  const driver = new MyGoDriver(client, TEST_CONFIG)

  const result = await driver.reconcileBooking({
    supplier: "mygo",
    supplierHotelCode: "555",
    checkIn: "2026-09-10",
    checkOut: "2026-09-13",
  })

  assert.equal(result.outcome, "FOUND")
  if (result.outcome === "FOUND") {
    assert.equal(result.supplierBookingReference, "777")
    assert.equal(result.confirmedNetPrice, 1838.7)
  }
})

test("MyGoDriver.reconcileBooking : aucune réservation correspondante -> NOT_FOUND (Phase 27.2)", async () => {
  const client = mockClient({ listBookings: async () => [] })
  const driver = new MyGoDriver(client, TEST_CONFIG)

  const result = await driver.reconcileBooking({
    supplier: "mygo",
    supplierHotelCode: "555",
    checkIn: "2026-09-10",
    checkOut: "2026-09-13",
  })

  assert.equal(result.outcome, "NOT_FOUND")
})

test("MyGoDriver.reconcileBooking : BookingList elle-même inaccessible -> STILL_AMBIGUOUS, jamais un faux NOT_FOUND (Phase 27.2)", async () => {
  const client = mockClient({ listBookings: async () => { throw new MyGoNetworkError("ECONNRESET") } })
  const driver = new MyGoDriver(client, TEST_CONFIG)

  const result = await driver.reconcileBooking({
    supplier: "mygo",
    supplierHotelCode: "555",
    checkIn: "2026-09-10",
    checkOut: "2026-09-13",
  })

  assert.equal(result.outcome, "STILL_AMBIGUOUS")
})

test("MyGoDriver.cancel : mappe fee/currency/bookingId correctement vers SupplierCancellationResult", async () => {
  const cancellation: BookingCancellationDTO = { bookingId: 42, fee: 25.5, currency: "TND", preCancelled: false }
  const client = mockClient({ cancelBooking: async () => cancellation })
  const driver = new MyGoDriver(client, TEST_CONFIG)

  const result = await driver.cancel({ supplier: "mygo", supplierBookingReference: "42" })

  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.supplierBookingReference, "42")
    assert.equal(result.state, "CANCELLED")
    assert.equal(result.penaltyAmount, 25.5)
    assert.equal(result.penaltyCurrency, "TND")
  }
})

test("MyGoDriver.cancel : timeout fournisseur -> code TIMEOUT normalisé", async () => {
  class MyGoTimeoutError extends Error {
    constructor() {
      super("Request timed out")
      this.name = "MyGoTimeoutError"
    }
  }
  const client = mockClient({ cancelBooking: async () => { throw new MyGoTimeoutError() } })
  const driver = new MyGoDriver(client, TEST_CONFIG)

  const result = await driver.cancel({ supplier: "mygo", supplierBookingReference: "42" })

  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.code, "TIMEOUT")
})
