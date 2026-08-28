/**
 * PHASE "POLICY ENGINE OMRA/PACKAGE/ACTIVITY" — preuve live (DB réelle) que
 * `cancelPolicyReservationCore()` (lib/booking/policy-cancel-actions.ts)
 * respecte : appartenance, autorisation selon la politique FIGÉE au moment
 * de la réservation (jamais une résolution live), crédit wallet client
 * exact, idempotence (jamais un double crédit), isolation tenant, et
 * libération du stock (inverse mécanique du décrément fait à la création).
 *
 * `cancelPolicyReservationCore` prend l'identité déjà résolue en paramètre
 * (pas de session Supabase requise) — même principe que
 * `customer-ownership.test.ts`. Se dégrade en `skip` sans Postgres local.
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import {
  agencies,
  customers,
  reservations,
  reservationPackage,
  catalogPackages,
  catalogPackageDepartures,
  payments,
  auditEvents,
  walletAccounts,
  walletLedger,
} from "@/lib/db/schema"
import { getCustomerWalletBalance } from "@/lib/finance/customer-wallet"
import { cancelPolicyReservationCore } from "../policy-cancel-actions"
import type { PolicySnapshot } from "../policy-engine"

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
const skipReason = () => "Postgres local indisponible (DATABASE_URL)."

let agencyA = ""
let agencyB = ""
let ownerAuthUserId = ""
let ownerEmail = ""
let ownerCustomerId = ""
let packageId = ""
let departureId = ""

function makeSnapshot(overrides: Partial<NonNullable<PolicySnapshot["policy"]>> = {}): PolicySnapshot {
  return {
    resolvedAt: new Date().toISOString(),
    acceptedByCustomer: true,
    policy: {
      id: randomUUID(),
      agencyId: agencyA,
      productType: "package",
      productId: packageId,
      version: 1,
      cancellable: true,
      modifiable: false,
      deadlineHours: null,
      cancellationFeePercent: 20,
      refundAllowed: true,
      creditAllowed: true,
      nonRefundable: false,
      requiresValidatedDocument: false,
      postDeadlineDescription: null,
      effectiveFrom: new Date().toISOString(),
      ...overrides,
    },
  }
}

async function insertReservation(params: {
  tndAmount: string
  policySnapshot: PolicySnapshot
  status?: "pending" | "confirmed"
  withCapturedPayment?: boolean
  withStockExtension?: { adults: number; childrenAges: number[] }
}): Promise<string> {
  return withSystemContext(async (tx) => {
    const [reservation] = await tx
      .insert(reservations)
      .values({
        agencyId: agencyA,
        customerId: ownerCustomerId,
        publicRef: `PKT-${randomUUID().slice(0, 8)}`,
        module: "package",
        source: "internal",
        status: params.status ?? "confirmed",
        originalCurrency: "TND",
        originalAmount: params.tndAmount,
        tndAmount: params.tndAmount,
        depositAmount: params.tndAmount,
        depositPaid: params.tndAmount,
        providerPayload: { policySnapshot: params.policySnapshot },
      })
      .returning({ id: reservations.id })
    const reservationId = reservation!.id

    if (params.withCapturedPayment) {
      await tx.insert(payments).values({
        agencyId: agencyA,
        reservationId,
        psp: "manual",
        method: "card",
        originalCurrency: "TND",
        originalAmount: params.tndAmount,
        tndAmount: params.tndAmount,
        kind: "deposit",
        status: "captured",
        capturedAt: new Date(),
      })
    }

    if (params.withStockExtension) {
      await tx.insert(reservationPackage).values({
        reservationId,
        agencyId: agencyA,
        packageId,
        departureId,
        departureDate: "2027-01-10",
        returnDate: "2027-01-17",
        adults: params.withStockExtension.adults,
        childrenAges: params.withStockExtension.childrenAges,
      })
    }

    return reservationId
  })
}

before(async () => {
  dbAvailable = await isDbAvailable()
  if (!dbAvailable) return
  agencyA = randomUUID()
  agencyB = randomUUID()
  ownerAuthUserId = randomUUID()
  ownerEmail = `pc-owner-${randomUUID()}@example.com`

  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values([
      { id: agencyA, slug: `pc-a-${agencyA}`, name: "Policy Cancel Test Agency A", agencyType: "ota" },
      { id: agencyB, slug: `pc-b-${agencyB}`, name: "Policy Cancel Test Agency B", agencyType: "ota" },
    ])
    const [customer] = await tx
      .insert(customers)
      .values({
        agencyId: agencyA,
        authUserId: ownerAuthUserId,
        firstName: "Owner",
        lastName: "PolicyCancel",
        email: ownerEmail,
      })
      .returning({ id: customers.id })
    ownerCustomerId = customer!.id

    const [pkg] = await tx
      .insert(catalogPackages)
      .values({
        agencyId: agencyA,
        code: `PC-${randomUUID().slice(0, 6)}`,
        title: "Policy Cancel Test Package",
        slug: `pc-test-${randomUUID()}`,
        status: "published",
        channels: ["b2c"],
      })
      .returning({ id: catalogPackages.id })
    packageId = pkg!.id

    const [departure] = await tx
      .insert(catalogPackageDepartures)
      .values({
        agencyId: agencyA,
        packageId,
        departureDate: "2027-01-10",
        returnDate: "2027-01-17",
        adultPriceTnd: "500.00",
        totalSeats: 10,
        bookedSeats: 2,
        status: "open",
      })
      .returning({ id: catalogPackageDepartures.id })
    departureId = departure!.id
  })
})

after(async () => {
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    const walletRows = await tx
      .select({ id: walletAccounts.id })
      .from(walletAccounts)
      .where(eq(walletAccounts.customerId, ownerCustomerId))
    for (const w of walletRows) {
      await tx.delete(walletLedger).where(eq(walletLedger.walletAccountId, w.id))
    }
    await tx.delete(walletAccounts).where(eq(walletAccounts.customerId, ownerCustomerId))
    await tx.delete(reservationPackage).where(eq(reservationPackage.agencyId, agencyA))
    await tx.delete(payments).where(eq(payments.agencyId, agencyA))
    await tx.delete(auditEvents).where(eq(auditEvents.agencyId, agencyA))
    await tx.delete(reservations).where(eq(reservations.agencyId, agencyA))
    await tx.delete(catalogPackageDepartures).where(eq(catalogPackageDepartures.agencyId, agencyA))
    await tx.delete(catalogPackages).where(eq(catalogPackages.agencyId, agencyA))
    await tx.delete(customers).where(eq(customers.agencyId, agencyA))
    await tx.delete(agencies).where(eq(agencies.id, agencyA))
    await tx.delete(agencies).where(eq(agencies.id, agencyB))
  })
})

test("cancelPolicyReservationCore : politique avec frais 20% → crédit wallet exact, jamais un pourcentage inventé", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const reservationId = await insertReservation({
    tndAmount: "1000.00",
    policySnapshot: makeSnapshot({ cancellationFeePercent: 20 }),
    withCapturedPayment: true,
  })
  const balanceBefore = await getCustomerWalletBalance(ownerCustomerId)

  const result = await cancelPolicyReservationCore(
    { agencyId: agencyA, userId: ownerAuthUserId, isSuperAdmin: false },
    { authUserId: ownerAuthUserId, verifiedEmail: ownerEmail },
    reservationId,
  )

  assert.equal(result.ok, true)
  if (!result.ok || !result.allowed) throw new Error("expected allowed:true")
  assert.equal(result.creditedTnd, 800)
  assert.equal(result.feePercent, 20)
  assert.deepEqual(result.messages, ["Annulation acceptée", "Frais configurés: 20%", "Crédit Easy2Book: 800.000 DT"])

  const balanceAfter = await getCustomerWalletBalance(ownerCustomerId)
  assert.equal(balanceAfter - balanceBefore, 800, "le wallet client est crédité du montant exact calculé par la politique")

  const [row] = await withSystemContext((tx) =>
    tx.select({ status: reservations.status }).from(reservations).where(eq(reservations.id, reservationId)),
  )
  assert.equal(row!.status, "cancelled")

  const audit = await withSystemContext((tx) =>
    tx.select().from(auditEvents).where(eq(auditEvents.entityId, reservationId)),
  )
  assert.ok(audit.some((e) => e.action === "reservation.cancelled" && (e.diff as Record<string, unknown>)?.via === "policy_engine"))
})

test("cancelPolicyReservationCore : cancellable=false → refusé, aucun crédit, aucun changement de statut", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const reservationId = await insertReservation({
    tndAmount: "500.00",
    policySnapshot: makeSnapshot({ cancellable: false }),
    withCapturedPayment: true,
  })
  const balanceBefore = await getCustomerWalletBalance(ownerCustomerId)

  const result = await cancelPolicyReservationCore(
    { agencyId: agencyA, userId: ownerAuthUserId, isSuperAdmin: false },
    { authUserId: ownerAuthUserId, verifiedEmail: ownerEmail },
    reservationId,
  )

  assert.equal(result.ok, true)
  if (!result.ok || result.allowed) throw new Error("expected allowed:false")
  assert.deepEqual(result.messages, ["Annulation non autorisée selon la politique"])

  const balanceAfter = await getCustomerWalletBalance(ownerCustomerId)
  assert.equal(balanceAfter, balanceBefore, "aucun crédit n'est appliqué quand l'annulation est refusée")

  const [row] = await withSystemContext((tx) =>
    tx.select({ status: reservations.status }).from(reservations).where(eq(reservations.id, reservationId)),
  )
  assert.equal(row!.status, "confirmed", "le statut reste inchangé quand l'annulation est refusée")
})

test("cancelPolicyReservationCore : aucune politique définie au moment de la réservation → non autorisé, jamais un calcul inventé", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const reservationId = await insertReservation({
    tndAmount: "500.00",
    policySnapshot: { resolvedAt: new Date().toISOString(), acceptedByCustomer: false, policy: null },
    withCapturedPayment: true,
  })

  const result = await cancelPolicyReservationCore(
    { agencyId: agencyA, userId: ownerAuthUserId, isSuperAdmin: false },
    { authUserId: ownerAuthUserId, verifiedEmail: ownerEmail },
    reservationId,
  )
  assert.equal(result.ok, true)
  if (!result.ok || result.allowed) throw new Error("expected allowed:false")
})

test("cancelPolicyReservationCore : idempotence — un second appel ne double-crédite jamais le wallet", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const reservationId = await insertReservation({
    tndAmount: "1000.00",
    policySnapshot: makeSnapshot({ cancellationFeePercent: 0 }),
    withCapturedPayment: true,
  })
  const balanceBefore = await getCustomerWalletBalance(ownerCustomerId)

  const first = await cancelPolicyReservationCore(
    { agencyId: agencyA, userId: ownerAuthUserId, isSuperAdmin: false },
    { authUserId: ownerAuthUserId, verifiedEmail: ownerEmail },
    reservationId,
  )
  assert.equal(first.ok, true)
  if (!first.ok || !first.allowed) throw new Error("expected first call allowed:true")
  assert.equal(first.creditedTnd, 1000)

  const balanceAfterFirst = await getCustomerWalletBalance(ownerCustomerId)
  assert.equal(balanceAfterFirst - balanceBefore, 1000)

  const second = await cancelPolicyReservationCore(
    { agencyId: agencyA, userId: ownerAuthUserId, isSuperAdmin: false },
    { authUserId: ownerAuthUserId, verifiedEmail: ownerEmail },
    reservationId,
  )
  assert.equal(second.ok, false, "une réservation déjà annulée ne peut pas être annulée une seconde fois")

  const balanceAfterSecond = await getCustomerWalletBalance(ownerCustomerId)
  assert.equal(balanceAfterSecond, balanceAfterFirst, "aucun crédit supplémentaire au second appel")
})

test("cancelPolicyReservationCore : appartenance — un autre client ne peut jamais annuler la réservation d'autrui", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const reservationId = await insertReservation({
    tndAmount: "500.00",
    policySnapshot: makeSnapshot(),
    withCapturedPayment: true,
  })

  const result = await cancelPolicyReservationCore(
    { agencyId: agencyA, userId: randomUUID(), isSuperAdmin: false },
    { authUserId: randomUUID(), verifiedEmail: `intrus-${randomUUID()}@example.com` },
    reservationId,
  )
  assert.equal(result.ok, false)
  if (result.ok) throw new Error("expected ok:false")
  assert.equal(result.code, "NOT_FOUND", "une réservation d'un autre client retombe sur NOT_FOUND, jamais un FORBIDDEN qui en confirmerait l'existence")

  const [row] = await withSystemContext((tx) =>
    tx.select({ status: reservations.status }).from(reservations).where(eq(reservations.id, reservationId)),
  )
  assert.equal(row!.status, "confirmed")
})

test("cancelPolicyReservationCore : isolation tenant — même identité mais scope agence différent → NOT_FOUND", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const reservationId = await insertReservation({
    tndAmount: "500.00",
    policySnapshot: makeSnapshot(),
    withCapturedPayment: true,
  })

  const result = await cancelPolicyReservationCore(
    { agencyId: agencyB, userId: ownerAuthUserId, isSuperAdmin: false },
    { authUserId: ownerAuthUserId, verifiedEmail: ownerEmail },
    reservationId,
  )
  assert.equal(result.ok, false)
  if (result.ok) throw new Error("expected ok:false")
  assert.equal(result.code, "NOT_FOUND", "la réservation appartient à l'agence A, jamais visible/annulable depuis l'agence B")
})

test("cancelPolicyReservationCore : libère le stock consommé à la réservation (inverse du décrément à la création)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const reservationId = await insertReservation({
    tndAmount: "1000.00",
    policySnapshot: makeSnapshot({ cancellationFeePercent: 0 }),
    withCapturedPayment: true,
    withStockExtension: { adults: 2, childrenAges: [] },
  })

  const [before] = await withSystemContext((tx) =>
    tx.select({ bookedSeats: catalogPackageDepartures.bookedSeats }).from(catalogPackageDepartures).where(eq(catalogPackageDepartures.id, departureId)),
  )
  assert.equal(before!.bookedSeats, 2, "fixture : 2 places déjà réservées avant ce test")

  const result = await cancelPolicyReservationCore(
    { agencyId: agencyA, userId: ownerAuthUserId, isSuperAdmin: false },
    { authUserId: ownerAuthUserId, verifiedEmail: ownerEmail },
    reservationId,
  )
  assert.equal(result.ok, true)
  if (!result.ok || !result.allowed) throw new Error("expected allowed:true")

  const [after1] = await withSystemContext((tx) =>
    tx.select({ bookedSeats: catalogPackageDepartures.bookedSeats }).from(catalogPackageDepartures).where(eq(catalogPackageDepartures.id, departureId)),
  )
  assert.equal(after1!.bookedSeats, 0, "les 2 places consommées par cette réservation sont rendues disponibles")
})
