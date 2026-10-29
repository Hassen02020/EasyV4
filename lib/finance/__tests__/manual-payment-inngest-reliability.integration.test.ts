/**
 * INNGEST-RELIABILITY-01 — preuve d'intégration réelle (PostgreSQL, rôle
 * `app_runtime` non-BYPASSRLS) : une panne Inngest au moment de la
 * confirmation d'un paiement manuel ne perd plus l'événement en silence,
 * n'invalide jamais le paiement, et NE PERSISTE AUCUNE donnée client.
 *
 * Les cinq modules concernés (hôtel, Omra, package, transfert, voiture) sont
 * exercés avec Inngest en panne et un paiement intégral :
 *  - paiement, confirmation, facture unique et paire de lignes du ledger
 *    corrects ;
 *  - 3 tentatives exactement, puis UNE trace `inngest.dispatch_failed` ;
 *  - la trace persistée ne contient que des données techniques : ni email, ni
 *    téléphone, ni token de voucher, ni charge utile ;
 *  - l'accès à la trace respecte la RLS (même agence ou super_admin).
 * Plus : acompte (aucun envoi), Inngest disponible (id d'événement transmis),
 * échec de l'écriture de la trace (FK) sans exception, rejeu refusé.
 *
 * Même technique d'interception que manual-payment-transfer-voucher
 * .integration.test.ts (t.mock.module pour la session, monkey-patch de
 * inngest.send).
 */

import test, { before } from "node:test"
import type { TestContext } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { and, eq, sql } from "drizzle-orm"

import { withSystemContext, withTenantContext } from "@/lib/db/tenant-context"
import {
  agencies,
  auditEvents,
  carCategories,
  carLocations,
  catalogPackages,
  customers,
  omraPackages,
  partnerInvoices,
  payments,
  reservationCar,
  reservationHotel,
  reservationOmra,
  reservationPackage,
  reservationStatusHistory,
  reservationTransfer,
  reservations,
  walletLedger,
} from "@/lib/db/schema"
import { inngest } from "@/lib/inngest/client"
import {
  INNGEST_DISPATCH_FAILED_ACTION,
  sendEventReliable,
} from "@/lib/inngest/send-reliable"
import type { VerifyManualPaymentResult } from "../manual-payment-actions"

async function isDbAvailable(): Promise<boolean> {
  try {
    await withSystemContext(async (tx) => {
      await tx.execute(sql`select 1`)
    })
    return true
  } catch {
    return false
  }
}

let dbAvailable = false
const skip = () =>
  "Postgres local indisponible (DATABASE_URL) — voir commission-reversal-integration.test.ts pour la procédure."

before(async () => {
  dbAvailable = await isDbAvailable()
})

interface InngestCalls {
  n: number
  ids: Array<string | undefined>
  names: string[]
}

async function setup(
  t: TestContext,
  session: { authUserId: string; agencyId: string },
  opts: { inngestDown: boolean },
): Promise<{
  verifyManualPayment: (
    input: Parameters<
      typeof import("../manual-payment-actions").verifyManualPayment
    >[0],
  ) => Promise<VerifyManualPaymentResult>
  calls: InngestCalls
  errorLines: string[]
}> {
  const calls: InngestCalls = { n: 0, ids: [], names: [] }
  const originalSend = inngest.send
  inngest.send = (async (payload: { id?: string; name: string }) => {
    calls.n++
    calls.ids.push(payload.id)
    calls.names.push(payload.name)
    if (opts.inngestDown) throw new Error("Inngest indisponible (simulé)")
    return { ids: ["test"] }
  }) as unknown as typeof inngest.send
  t.after(() => {
    inngest.send = originalSend
  })
  // Le backoff réel (100 + 200 ms) est conservé : preuve du comportement
  // de production, coût négligeable.
  const errorLines: string[] = []
  const originalError = console.error
  console.error = (...args: unknown[]) => {
    errorLines.push(args.map(String).join(" "))
  }
  t.after(() => {
    console.error = originalError
  })

  t.mock.module("@/lib/supabase/server", {
    namedExports: {
      createServerSupabase: async () => ({
        auth: {
          getUser: async () => ({ data: { user: { id: session.authUserId } } }),
        },
      }),
    },
  })
  t.mock.module("@/lib/auth/profile", {
    namedExports: {
      getCurrentAdminProfile: async () => ({
        role: "super_admin",
        agencyId: session.agencyId,
      }),
    },
  })
  const mod = await import("../manual-payment-actions")
  return { verifyManualPayment: mod.verifyManualPayment, calls, errorLines }
}

/* -------------------------------------------------------------------------- */
/* Fixtures Omra / Package / Car (reprises de manual-payment-voucher-dispatch) */
/* -------------------------------------------------------------------------- */

interface OmraFixture {
  agencyId: string
  customerId: string
  authUserId: string
  reservationId: string
  omraPackageId: string
}

async function createOmraFixture(
  opts: { tndAmount?: string; validOmraPackage?: boolean } = {},
): Promise<OmraFixture> {
  const agencyId = randomUUID()
  const customerId = randomUUID()
  const authUserId = randomUUID()
  const reservationId = randomUUID()
  const omraPackageId = randomUUID()
  const validOmraPackage = opts.validOmraPackage ?? true
  const tndAmount = opts.tndAmount ?? "2000.00"

  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values({
      id: agencyId,
      slug: `voucher-dispatch-omra-${agencyId.slice(0, 8)}`,
      name: "VOUCHER-OMRA-PACKAGE-INTEGRATION-TESTS-01 — agence test",
      agencyType: "ota",
    })
    await tx.insert(customers).values({
      id: customerId,
      agencyId,
      firstName: "Test",
      lastName: "Omra",
      email: `omra-${customerId.slice(0, 8)}@example.test`,
      phone: "20000000",
    })
    if (validOmraPackage) {
      await tx.insert(omraPackages).values({
        id: omraPackageId,
        agencyId,
        type: "omra",
        name: "Omra Ramadan — Test Fixture",
        durationDays: 10,
        validFrom: "2027-01-01",
        validUntil: "2027-12-31",
        basePrice: "1000.000",
      })
    }
    await tx.insert(reservations).values({
      id: reservationId,
      agencyId,
      customerId,
      module: "omra",
      source: "manual",
      status: "pending",
      originalCurrency: "TND",
      originalAmount: tndAmount,
      tndAmount,
      publicRef: `TST-OMRA-${reservationId.slice(0, 8)}`,
      guestAccessToken: randomUUID(),
    })
    await tx.insert(reservationOmra).values({
      reservationId,
      agencyId,
      // Si validOmraPackage=false, référence volontairement une ligne
      // omra_packages inexistante — simule un catalogue supprimé après la
      // réservation (reservationOmra.omraPackageId n'a pas de contrainte FK,
      // vérifié dans lib/db/schema/omra.ts).
      omraPackageId: validOmraPackage ? omraPackageId : randomUUID(),
      departureDate: "2027-03-01",
      returnDate: "2027-03-11",
      pilgrims: 2,
    })
  })

  return { agencyId, customerId, authUserId, reservationId, omraPackageId }
}

interface PackageFixture {
  agencyId: string
  customerId: string
  authUserId: string
  reservationId: string
  catalogPackageId: string
}

async function createPackageFixture(
  opts: { tndAmount?: string; validCatalogPackage?: boolean } = {},
): Promise<PackageFixture> {
  const agencyId = randomUUID()
  const customerId = randomUUID()
  const authUserId = randomUUID()
  const reservationId = randomUUID()
  const catalogPackageId = randomUUID()
  const validCatalogPackage = opts.validCatalogPackage ?? true
  const tndAmount = opts.tndAmount ?? "3000.00"

  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values({
      id: agencyId,
      slug: `voucher-dispatch-pkg-${agencyId.slice(0, 8)}`,
      name: "VOUCHER-OMRA-PACKAGE-INTEGRATION-TESTS-01 — agence test",
      agencyType: "ota",
    })
    await tx.insert(customers).values({
      id: customerId,
      agencyId,
      firstName: "Test",
      lastName: "Package",
      email: `pkg-${customerId.slice(0, 8)}@example.test`,
      phone: "20000001",
    })
    if (validCatalogPackage) {
      await tx.insert(catalogPackages).values({
        id: catalogPackageId,
        agencyId,
        code: `PKG-${catalogPackageId.slice(0, 8)}`,
        title: "Istanbul Découverte — Test Fixture",
        slug: `istanbul-decouverte-${catalogPackageId.slice(0, 8)}`,
      })
    }
    await tx.insert(reservations).values({
      id: reservationId,
      agencyId,
      customerId,
      module: "package",
      source: "manual",
      status: "pending",
      originalCurrency: "TND",
      originalAmount: tndAmount,
      tndAmount,
      publicRef: `TST-PKG-${reservationId.slice(0, 8)}`,
      guestAccessToken: randomUUID(),
    })
    await tx.insert(reservationPackage).values({
      reservationId,
      agencyId,
      packageId: validCatalogPackage ? catalogPackageId : randomUUID(),
      departureId: randomUUID(),
      departureDate: "2027-05-01",
      returnDate: "2027-05-08",
      adults: 2,
      childrenAges: [8],
    })
  })

  return {
    agencyId,
    customerId,
    authUserId,
    reservationId,
    catalogPackageId,
  }
}

interface CarFixture {
  agencyId: string
  customerId: string
  authUserId: string
  reservationId: string
  categoryId: string
  pickupLocationId: string
  dropoffLocationId: string
}

async function createCarFixture(
  opts: { tndAmount?: string; withExtension?: boolean } = {},
): Promise<CarFixture> {
  const agencyId = randomUUID()
  const customerId = randomUUID()
  const authUserId = randomUUID()
  const reservationId = randomUUID()
  const categoryId = randomUUID()
  const pickupLocationId = randomUUID()
  const dropoffLocationId = randomUUID()
  const withExtension = opts.withExtension ?? true
  const tndAmount = opts.tndAmount ?? "450.00"

  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values({
      id: agencyId,
      slug: `voucher-dispatch-car-${agencyId.slice(0, 8)}`,
      name: "VOUCHER-CAR-TRANSFER-DATA-01 — agence test",
      agencyType: "ota",
    })
    await tx.insert(customers).values({
      id: customerId,
      agencyId,
      firstName: "Test",
      lastName: "Car",
      email: `car-${customerId.slice(0, 8)}@example.test`,
      phone: "20000002",
    })
    await tx.insert(carCategories).values({
      id: categoryId,
      agencyId,
      code: `CAT-${categoryId.slice(0, 8)}`,
      name: "SUV Confort — Test Fixture",
    })
    await tx.insert(carLocations).values({
      id: pickupLocationId,
      agencyId,
      name: "Aéroport Tunis-Carthage — Test Fixture",
      city: "Tunis",
    })
    await tx.insert(carLocations).values({
      id: dropoffLocationId,
      agencyId,
      name: "Centre-ville Sousse — Test Fixture",
      city: "Sousse",
    })
    await tx.insert(reservations).values({
      id: reservationId,
      agencyId,
      customerId,
      module: "car",
      source: "manual",
      status: "pending",
      originalCurrency: "TND",
      originalAmount: tndAmount,
      tndAmount,
      publicRef: `TST-CAR-${reservationId.slice(0, 8)}`,
      guestAccessToken: randomUUID(),
    })
    // withExtension=false simule une anomalie d'intégrité (réservation "car"
    // sans sa ligne reservation_car) plutôt qu'un "catalogue supprimé" comme
    // pour omra/package : categoryId/pickupLocationId/dropoffLocationId
    // portent de VRAIES contraintes FK ON DELETE RESTRICT sur reservation_car
    // (lib/db/schema/cars.ts), contrairement à reservationOmra.omraPackageId
    // (aucune FK déclarée) — un catalogue réellement supprimé après la
    // réservation est donc impossible à simuler ici (et impossible en
    // production tant qu'une réservation y réfère). La garde défensive du
    // dispatch (aucun nom résolu => log + skip) reste exercée par ce chemin
    // alternatif, réellement atteignable si cette ligne d'extension manque.
    if (withExtension) {
      await tx.insert(reservationCar).values({
        reservationId,
        agencyId,
        categoryId,
        pickupLocationId,
        dropoffLocationId,
        pickupAt: new Date("2027-06-01T10:00:00Z"),
        dropoffAt: new Date("2027-06-05T10:00:00Z"),
        rentalDays: 4,
        driverFullName: "Test Car Driver",
        driverLicenseNumber: "LIC-TEST-FIXTURE-001",
      })
    }
  })

  return {
    agencyId,
    customerId,
    authUserId,
    reservationId,
    categoryId,
    pickupLocationId,
    dropoffLocationId,
  }
}

async function cleanupReservation(reservationId: string): Promise<void> {
  await withSystemContext(async (tx) => {
    // generateInvoiceForReservation (appelée par verifyManualPayment sur
    // fullyPaid) insère dans partner_invoices — FK reservation_id, à
    // nettoyer avant la réservation elle-même.
    await tx
      .delete(partnerInvoices)
      .where(eq(partnerInvoices.reservationId, reservationId))
    await tx.delete(payments).where(eq(payments.reservationId, reservationId))
    await tx.delete(auditEvents).where(eq(auditEvents.entityId, reservationId))
    await tx
      .delete(reservationStatusHistory)
      .where(eq(reservationStatusHistory.reservationId, reservationId))
    await tx
      .delete(reservationOmra)
      .where(eq(reservationOmra.reservationId, reservationId))
    await tx
      .delete(reservationPackage)
      .where(eq(reservationPackage.reservationId, reservationId))
    await tx
      .delete(reservationCar)
      .where(eq(reservationCar.reservationId, reservationId))
    await tx.delete(reservations).where(eq(reservations.id, reservationId))
  })
}

async function cleanupAgency(
  agencyId: string,
  customerId: string,
  opts: {
    omraPackageId?: string
    catalogPackageId?: string
    carCategoryId?: string
    carPickupLocationId?: string
    carDropoffLocationId?: string
  } = {},
): Promise<void> {
  await withSystemContext(async (tx) => {
    if (opts.omraPackageId) {
      await tx
        .delete(omraPackages)
        .where(eq(omraPackages.id, opts.omraPackageId))
    }
    if (opts.catalogPackageId) {
      await tx
        .delete(catalogPackages)
        .where(eq(catalogPackages.id, opts.catalogPackageId))
    }
    if (opts.carCategoryId) {
      await tx
        .delete(carCategories)
        .where(eq(carCategories.id, opts.carCategoryId))
    }
    if (opts.carPickupLocationId) {
      await tx
        .delete(carLocations)
        .where(eq(carLocations.id, opts.carPickupLocationId))
    }
    if (opts.carDropoffLocationId) {
      await tx
        .delete(carLocations)
        .where(eq(carLocations.id, opts.carDropoffLocationId))
    }
    await tx.delete(customers).where(eq(customers.id, customerId))
    await tx.delete(agencies).where(eq(agencies.id, agencyId))
  })
}

/* -------------------------------------------------------------------------- */
/* Fixtures Hôtel et Transfert                                                */
/* -------------------------------------------------------------------------- */

interface SimpleFx {
  agencyId: string
  customerId: string
  authUserId: string
  reservationId: string
}

async function createHotelFixture(): Promise<SimpleFx> {
  const agencyId = randomUUID()
  const customerId = randomUUID()
  const reservationId = randomUUID()
  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values({
      id: agencyId,
      slug: `inngest-rel-hotel-${agencyId.slice(0, 8)}`,
      name: "INNGEST-RELIABILITY-01 hotel — agence test",
      agencyType: "ota",
    })
    await tx.insert(customers).values({
      id: customerId,
      agencyId,
      firstName: "Test",
      lastName: "Hotel",
      email: `hotel-${customerId.slice(0, 8)}@example.test`,
      phone: "20000010",
    })
    await tx.insert(reservations).values({
      id: reservationId,
      agencyId,
      customerId,
      module: "hotel",
      source: "manual",
      status: "pending",
      originalCurrency: "TND",
      originalAmount: "900.00",
      tndAmount: "900.00",
      publicRef: `TST-HT-${reservationId.slice(0, 8)}`,
      guestAccessToken: randomUUID(),
    })
    await tx.insert(reservationHotel).values({
      reservationId,
      agencyId,
      hotelId: 1,
      hotelName: "Hôtel Test Fixture",
      checkIn: "2027-03-01",
      checkOut: "2027-03-04",
      nights: 3,
      adults: 2,
    })
  })
  return { agencyId, customerId, authUserId: randomUUID(), reservationId }
}

async function createTransferFixture(): Promise<SimpleFx> {
  const agencyId = randomUUID()
  const customerId = randomUUID()
  const reservationId = randomUUID()
  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values({
      id: agencyId,
      slug: `inngest-rel-tr-${agencyId.slice(0, 8)}`,
      name: "INNGEST-RELIABILITY-01 transfer — agence test",
      agencyType: "ota",
    })
    await tx.insert(customers).values({
      id: customerId,
      agencyId,
      firstName: "Test",
      lastName: "Fiabilite",
      email: `ir-${customerId.slice(0, 8)}@example.test`,
      phone: "20000003",
    })
    await tx.insert(reservations).values({
      id: reservationId,
      agencyId,
      customerId,
      module: "transfer",
      source: "manual",
      status: "pending",
      originalCurrency: "TND",
      originalAmount: "120.00",
      tndAmount: "120.00",
      publicRef: `TST-IR-${reservationId.slice(0, 8)}`,
      guestAccessToken: randomUUID(),
    })
    await tx.insert(reservationTransfer).values({
      reservationId,
      agencyId,
      pickupAddress: "Aéroport — Test Fixture",
      dropoffAddress: "Hammamet — Test Fixture",
      pickupAt: new Date("2027-03-01T13:30:00.000Z"),
      pax: 2,
      vehicleType: "van",
    })
  })
  return { agencyId, customerId, authUserId: randomUUID(), reservationId }
}

/* -------------------------------------------------------------------------- */
/* Lectures                                                                   */
/* -------------------------------------------------------------------------- */

async function failedTraces(reservationId: string) {
  return withSystemContext((tx) =>
    tx
      .select({
        agencyId: auditEvents.agencyId,
        entityType: auditEvents.entityType,
        diff: auditEvents.diff,
      })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.entityId, reservationId),
          eq(auditEvents.action, INNGEST_DISPATCH_FAILED_ACTION),
        ),
      ),
  )
}

async function statusOf(id: string) {
  const [row] = await withSystemContext((tx) =>
    tx
      .select({ status: reservations.status })
      .from(reservations)
      .where(eq(reservations.id, id)),
  )
  return row?.status
}

async function ledgerOf(reservationId: string) {
  const rows = await withSystemContext((tx) =>
    tx
      .select({ type: walletLedger.type, amount: walletLedger.amount })
      .from(walletLedger)
      .where(eq(walletLedger.reservationId, reservationId)),
  )
  return rows
    .map((r) => ({ type: String(r.type), amount: r.amount }))
    .sort((a, b) => a.type.localeCompare(b.type))
}

async function invoiceCount(reservationId: string) {
  const rows = await withSystemContext((tx) =>
    tx
      .select({ id: partnerInvoices.id })
      .from(partnerInvoices)
      .where(eq(partnerInvoices.reservationId, reservationId)),
  )
  return rows.length
}

/** Aucune donnée client (email, téléphone, token) dans les lignes persistées. */
async function assertTraceHasNoCustomerData(
  reservationId: string,
  customerId: string,
) {
  const [cust] = await withSystemContext((tx) =>
    tx
      .select({ email: customers.email, phone: customers.phone })
      .from(customers)
      .where(eq(customers.id, customerId)),
  )
  const [res] = await withSystemContext((tx) =>
    tx
      .select({ token: reservations.guestAccessToken })
      .from(reservations)
      .where(eq(reservations.id, reservationId)),
  )
  const rows = await withSystemContext((tx) =>
    tx
      .select({
        entityId: auditEvents.entityId,
        action: auditEvents.action,
        diff: auditEvents.diff,
      })
      .from(auditEvents)
      .where(eq(auditEvents.entityId, reservationId)),
  )
  const dumped = JSON.stringify(
    rows.filter((r) => r.action === INNGEST_DISPATCH_FAILED_ACTION),
  )
  assert.ok(cust?.email && !dumped.includes(cust.email), "email persisté")
  assert.ok(cust?.phone && !dumped.includes(cust.phone), "téléphone persisté")
  assert.ok(res?.token && !dumped.includes(res.token), "token persisté")
  assert.ok(!dumped.includes("@example.test"), "adresse email persistée")
  assert.ok(!dumped.includes("payload"), "charge utile persistée")
}

const TECHNICAL_KEYS = [
  "attempts",
  "error",
  "eventId",
  "eventKeyConfigured",
  "eventName",
  "failedAt",
]

/* -------------------------------------------------------------------------- */
/* Inngest en panne + paiement intégral — les cinq modules                    */
/* -------------------------------------------------------------------------- */

interface ModuleCase {
  label: string
  event: string
  amount: number
  amountStr: string
  make: () => Promise<{
    agencyId: string
    customerId: string
    authUserId: string
    reservationId: string
    cleanup: () => Promise<void>
  }>
}

const CASES: ModuleCase[] = [
  {
    label: "hôtel",
    event: "booking/confirmed",
    amount: 900,
    amountStr: "900.00",
    make: async () => {
      const fx = await createHotelFixture()
      return { ...fx, cleanup: () => cleanupAll(fx) }
    },
  },
  {
    label: "Omra",
    event: "booking/omra.confirmed",
    amount: 2000,
    amountStr: "2000.00",
    make: async () => {
      const fx = await createOmraFixture()
      return {
        ...fx,
        cleanup: async () => {
          await cleanupReservation(fx.reservationId)
          await cleanupAgency(fx.agencyId, fx.customerId, {
            omraPackageId: fx.omraPackageId,
          })
        },
      }
    },
  },
  {
    label: "package",
    event: "booking/package.confirmed",
    amount: 3000,
    amountStr: "3000.00",
    make: async () => {
      const fx = await createPackageFixture()
      return {
        ...fx,
        cleanup: async () => {
          await cleanupReservation(fx.reservationId)
          await cleanupAgency(fx.agencyId, fx.customerId, {
            catalogPackageId: fx.catalogPackageId,
          })
        },
      }
    },
  },
  {
    label: "transfert",
    event: "booking/transfer.confirmed",
    amount: 120,
    amountStr: "120.00",
    make: async () => {
      const fx = await createTransferFixture()
      return { ...fx, cleanup: () => cleanupAll(fx) }
    },
  },
  {
    label: "voiture",
    event: "booking/car.confirmed",
    amount: 450,
    amountStr: "450.00",
    make: async () => {
      const fx = await createCarFixture()
      return {
        ...fx,
        cleanup: async () => {
          await cleanupReservation(fx.reservationId)
          await cleanupAgency(fx.agencyId, fx.customerId, {
            carCategoryId: fx.categoryId,
            carPickupLocationId: fx.pickupLocationId,
            carDropoffLocationId: fx.dropoffLocationId,
          })
        },
      }
    },
  },
]

async function cleanupAll(fx: SimpleFx): Promise<void> {
  await cleanupReservation(fx.reservationId)
  await cleanupAgency(fx.agencyId, fx.customerId)
}

for (const c of CASES) {
  test(`${c.label} — Inngest en panne + paiement intégral : paiement/ledger/facture corrects, 3 tentatives, une trace technique sans donnée client`, async (t) => {
    if (!dbAvailable) return void t.skip(skip())
    const fx = await c.make()
    t.after(fx.cleanup)
    const { verifyManualPayment, calls } = await setup(t, fx, {
      inngestDown: true,
    })

    const result = await verifyManualPayment({
      reservationId: fx.reservationId,
      method: "transfer",
      reference: `IR-${c.event}`.slice(0, 30),
      amountTnd: c.amount,
    })

    // Le paiement n'est PAS invalidé par la panne de notification.
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.fullyPaid, true)
    assert.equal(await statusOf(fx.reservationId), "confirmed")
    assert.deepEqual(await ledgerOf(fx.reservationId), [
      { type: "credit", amount: c.amountStr },
      { type: "debit", amount: c.amountStr },
    ])
    assert.equal(await invoiceCount(fx.reservationId), 1)

    // Tentatives bornées : exactement 3, toutes avec l'id stable.
    assert.equal(calls.n, 3)
    assert.deepEqual(calls.names, [c.event, c.event, c.event])
    assert.deepEqual(new Set(calls.ids).size, 1)
    assert.equal(calls.ids[0], `${c.event}:${fx.reservationId}`)

    // Une seule trace, technique uniquement.
    const traces = await failedTraces(fx.reservationId)
    assert.equal(traces.length, 1)
    const trace = traces[0]!
    assert.equal(trace.agencyId, fx.agencyId)
    assert.equal(trace.entityType, "reservation")
    const diff = trace.diff as Record<string, unknown>
    assert.deepEqual(Object.keys(diff).sort(), TECHNICAL_KEYS)
    assert.equal(diff.eventName, c.event)
    assert.equal(diff.eventId, `${c.event}:${fx.reservationId}`)
    assert.equal(diff.attempts, 3)
    assert.match(String(diff.error), /Inngest indisponible/)
    await assertTraceHasNoCustomerData(fx.reservationId, fx.customerId)
  })
}

/* -------------------------------------------------------------------------- */
/* Autres cas                                                                 */
/* -------------------------------------------------------------------------- */

test("Inngest en panne + acompte : aucun envoi tenté, aucune trace, réservation reste pending", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const fx = await createTransferFixture()
  t.after(() => cleanupAll(fx))
  const { verifyManualPayment, calls } = await setup(t, fx, {
    inngestDown: true,
  })
  const result = await verifyManualPayment({
    reservationId: fx.reservationId,
    method: "transfer",
    reference: "IR-PARTIAL-001",
    amountTnd: 50,
  })
  assert.equal(result.ok && result.fullyPaid, false)
  assert.equal(calls.n, 0)
  assert.equal((await failedTraces(fx.reservationId)).length, 0)
  assert.equal(await statusOf(fx.reservationId), "pending")
})

test("Inngest disponible : un seul envoi, id stable transmis, aucune trace", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const fx = await createTransferFixture()
  t.after(() => cleanupAll(fx))
  const { verifyManualPayment, calls } = await setup(t, fx, {
    inngestDown: false,
  })
  const result = await verifyManualPayment({
    reservationId: fx.reservationId,
    method: "transfer",
    reference: "IR-OK-001",
    amountTnd: 120,
  })
  assert.equal(result.ok && result.fullyPaid, true)
  assert.equal(calls.n, 1)
  assert.equal(calls.ids[0], `booking/transfer.confirmed:${fx.reservationId}`)
  assert.equal((await failedTraces(fx.reservationId)).length, 0)
})

test("Inngest en panne + rejeu du règlement : refusé, une seule trace, aucun rejeu automatique", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const fx = await createTransferFixture()
  t.after(() => cleanupAll(fx))
  const { verifyManualPayment, calls } = await setup(t, fx, {
    inngestDown: true,
  })
  const input = {
    reservationId: fx.reservationId,
    method: "transfer" as const,
    reference: "IR-REPLAY-001",
    amountTnd: 120,
  }
  assert.equal((await verifyManualPayment(input)).ok, true)
  const afterFirst = calls.n
  assert.equal((await verifyManualPayment(input)).ok, false)
  assert.equal((await failedTraces(fx.reservationId)).length, 1)
  assert.equal(calls.n, afterFirst, "aucun nouvel envoi au rejeu")
})

test("échec de l'écriture de la trace (agence inexistante → FK) : aucune exception, traced=false, journal sans donnée client", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const reservationId = randomUUID()
  const bogusAgencyId = randomUUID() // n'existe pas → FK audit_events.agency_id
  const originalSend = inngest.send
  inngest.send = (async () => {
    throw new Error("Inngest indisponible (simulé)")
  }) as unknown as typeof inngest.send
  t.after(() => {
    inngest.send = originalSend
  })
  const lines: string[] = []
  const originalError = console.error
  console.error = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "))
  }
  t.after(() => {
    console.error = originalError
  })

  const result = await sendEventReliable(
    "booking/transfer.confirmed",
    {
      reservationId,
      publicRef: "TR-2026-000009",
      agencyId: bogusAgencyId,
      customerEmail: "secret.client@example.test",
      customerPhone: "20999999",
      fromZone: "A",
      toZone: "B",
      pickupAt: "2027-03-01T13:30:00.000Z",
      vehicleType: "van",
      totalTnd: 120,
    },
    { reservationId, agencyId: bogusAgencyId },
  )
  assert.equal(result.ok, false)
  assert.equal(result.ok === false && result.traced, false)
  const joined = lines.join("\n")
  assert.ok(joined.includes("INNGEST_DISPATCH_TRACE_FAILURE"))
  assert.ok(!joined.includes("secret.client@example.test"))
  assert.ok(!joined.includes("20999999"))
  assert.equal((await failedTraces(reservationId)).length, 0)
})

test("RLS : la trace est lisible par son agence et par un super_admin, pas par une autre agence", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const a = await createTransferFixture()
  const b = await createTransferFixture()
  t.after(() => cleanupAll(a))
  t.after(() => cleanupAll(b))
  const { verifyManualPayment } = await setup(t, a, { inngestDown: true })
  const r = await verifyManualPayment({
    reservationId: a.reservationId,
    method: "transfer",
    reference: "IR-RLS-001",
    amountTnd: 120,
  })
  assert.equal(r.ok, true)

  const read = (ctx: { agencyId: string | null; isSuperAdmin: boolean }) =>
    withTenantContext(
      {
        agencyId: ctx.agencyId,
        userId: randomUUID(),
        isSuperAdmin: ctx.isSuperAdmin,
      },
      (tx) =>
        tx
          .select({ id: auditEvents.id })
          .from(auditEvents)
          .where(
            and(
              eq(auditEvents.entityId, a.reservationId),
              eq(auditEvents.action, INNGEST_DISPATCH_FAILED_ACTION),
            ),
          ),
    )

  assert.equal(
    (await read({ agencyId: a.agencyId, isSuperAdmin: false })).length,
    1,
  )
  assert.equal(
    (await read({ agencyId: b.agencyId, isSuperAdmin: false })).length,
    0,
  )
  assert.equal((await read({ agencyId: null, isSuperAdmin: true })).length, 1)
})
