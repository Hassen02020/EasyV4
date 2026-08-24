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

  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.confirmedNetPrice, 1838.7)
    assert.equal(result.supplierBookingReference, "42")
    assert.equal(result.state, "CONFIRMED")
  }
})

test("MyGoDriver.book : erreur d'authentification fournisseur -> code AUTH_ERROR normalisé, jamais présenté comme un échec générique", async () => {
  class MyGoAuthError extends Error {
    constructor() {
      super("Authentication failed")
      this.name = "MyGoAuthError"
    }
  }
  const client = mockClient({ createBooking: async () => { throw new MyGoAuthError() } })
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

  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.code, "AUTH_ERROR")
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
