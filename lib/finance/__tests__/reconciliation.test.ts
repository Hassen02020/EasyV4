/**
 * Réconciliation financière — preuve live contre un Postgres réel, même
 * convention que lib/admin/__tests__/inventory-locks-core.test.ts : se
 * dégrade en `skip` sans DATABASE_URL/Postgres local disponible. Chaque
 * test crée ses propres fixtures (agence dédiée par randomUUID) pour ne
 * jamais interférer avec les autres tests ou données réelles.
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
  payments,
  pspWebhooks,
  partnerCreditMovements,
  auditEvents,
} from "@/lib/db/schema"
import { runPaymentReconciliation } from "../reconciliation"

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

let agencyId = ""
let customerId = ""

async function makeReservation(overrides: Partial<typeof reservations.$inferInsert> = {}) {
  return withSystemContext(async (tx) => {
    const [r] = await tx
      .insert(reservations)
      .values({
        agencyId,
        publicRef: `RC-${randomUUID().slice(0, 8)}`,
        customerId,
        module: "hotel",
        source: "internal",
        status: "pending",
        originalCurrency: "TND",
        originalAmount: "100.00",
        tndAmount: "100.00",
        ...overrides,
      })
      .returning({ id: reservations.id })
    return r!.id
  })
}

before(async () => {
  dbAvailable = await isDbAvailable()
  if (!dbAvailable) return

  agencyId = randomUUID()
  customerId = randomUUID()

  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values({
      id: agencyId,
      name: "RECONCILIATION Test Agency",
      agencyType: "ota",
      slug: `reconciliation-test-${agencyId.slice(0, 8)}`,
      depositBalance: "500.000",
    })
    await tx.insert(customers).values({
      id: customerId,
      agencyId,
      firstName: "Test",
      lastName: "Reconciliation",
    })
  })
})

after(async () => {
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    await tx.delete(auditEvents).where(eq(auditEvents.agencyId, agencyId))
    await tx.delete(payments).where(eq(payments.agencyId, agencyId))
    await tx.delete(pspWebhooks).where(eq(pspWebhooks.agencyId, agencyId))
    await tx.delete(partnerCreditMovements).where(eq(partnerCreditMovements.agencyId, agencyId))
    await tx.delete(reservations).where(eq(reservations.agencyId, agencyId))
    await tx.delete(customers).where(eq(customers.id, customerId))
    await tx.delete(agencies).where(eq(agencies.id, agencyId))
  })
})

test("runPaymentReconciliation : webhook en erreur récent => orphaned_webhook", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())

  await withSystemContext(async (tx) => {
    await tx.insert(pspWebhooks).values({
      agencyId,
      psp: "paymee",
      eventType: "payment.succeeded",
      payload: { test: true },
      signatureOk: true,
      error: "NO_MATCHING_PAYMENT",
    })
  })

  const { findings } = await runPaymentReconciliation()
  const found = findings.filter((f) => f.check === "orphaned_webhook" && f.agencyId === agencyId)
  assert.equal(found.length, 1)
  assert.equal(found[0]!.details.error, "NO_MATCHING_PAYMENT")
})

test("runPaymentReconciliation : paiement carte pending au-delà du délai => stuck_pending_payment", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())

  const reservationId = await makeReservation({
    status: "pending",
    paymentExpiresAt: new Date(Date.now() - 20 * 60 * 1000), // expiré depuis 20 min > grâce 15 min
  })
  await withSystemContext(async (tx) => {
    await tx.insert(payments).values({
      agencyId,
      reservationId,
      psp: "paymee",
      method: "card",
      originalCurrency: "TND",
      originalAmount: "100.00",
      tndAmount: "100.00",
      status: "pending",
    })
  })

  const { findings } = await runPaymentReconciliation()
  const found = findings.filter(
    (f) => f.check === "stuck_pending_payment" && f.details.reservationId === reservationId,
  )
  assert.equal(found.length, 1)
})

test("runPaymentReconciliation : paiement carte pending dans la fenêtre de grâce => pas encore signalé", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())

  const reservationId = await makeReservation({
    status: "pending",
    paymentExpiresAt: new Date(Date.now() + 5 * 60 * 1000), // pas encore expiré
  })
  await withSystemContext(async (tx) => {
    await tx.insert(payments).values({
      agencyId,
      reservationId,
      psp: "paymee",
      method: "card",
      originalCurrency: "TND",
      originalAmount: "100.00",
      tndAmount: "100.00",
      status: "pending",
    })
  })

  const { findings } = await runPaymentReconciliation()
  const found = findings.filter(
    (f) => f.check === "stuck_pending_payment" && f.details.reservationId === reservationId,
  )
  assert.equal(found.length, 0, "ne doit jamais signaler un paiement encore dans sa fenêtre de règlement")
})

test("runPaymentReconciliation : réservation confirmée sans paiement capturé => confirmed_without_payment", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())

  const reservationId = await makeReservation({ status: "confirmed", confirmedAt: new Date() })

  const { findings } = await runPaymentReconciliation()
  const found = findings.filter(
    (f) => f.check === "confirmed_without_payment" && f.details.reservationId === reservationId,
  )
  assert.equal(found.length, 1)
})

test("runPaymentReconciliation : réservation confirmée AVEC paiement capturé => pas signalée", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())

  const reservationId = await makeReservation({ status: "confirmed", confirmedAt: new Date() })
  await withSystemContext(async (tx) => {
    await tx.insert(payments).values({
      agencyId,
      reservationId,
      psp: "paymee",
      method: "card",
      originalCurrency: "TND",
      originalAmount: "100.00",
      tndAmount: "100.00",
      status: "captured",
      capturedAt: new Date(),
    })
  })

  const { findings } = await runPaymentReconciliation()
  const found = findings.filter(
    (f) => f.check === "confirmed_without_payment" && f.details.reservationId === reservationId,
  )
  assert.equal(found.length, 0)
})

test("runPaymentReconciliation : solde agence != dernier mouvement grand livre => wallet_ledger_drift", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())

  await withSystemContext(async (tx) => {
    // balance_after (600) volontairement différent de agencies.deposit_balance (500 posé au before())
    // — simule une dérive de tenue de compte.
    await tx.insert(partnerCreditMovements).values({
      agencyId,
      movementType: "credit",
      amount: "600.000",
      balanceAfter: "600.000",
      description: "Test drift fixture",
    })
  })

  const { findings } = await runPaymentReconciliation()
  const found = findings.filter((f) => f.check === "wallet_ledger_drift" && f.agencyId === agencyId)
  assert.equal(found.length, 1)
  assert.equal(found[0]!.details.storedBalance, "500.000")
  assert.equal(found[0]!.details.lastLedgerBalance, "600.000")
})

test("runPaymentReconciliation : journalise chaque écart dans audit_events", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())

  await withSystemContext(async (tx) => {
    await tx.insert(pspWebhooks).values({
      agencyId,
      psp: "paymee",
      eventType: "payment.succeeded",
      payload: { test: true },
      signatureOk: true,
      error: "AUDIT_TEST_MARKER",
    })
  })

  await runPaymentReconciliation()

  const rows = await withSystemContext((tx) =>
    tx
      .select({ action: auditEvents.action, entityType: auditEvents.entityType })
      .from(auditEvents)
      .where(eq(auditEvents.agencyId, agencyId)),
  )
  assert.ok(rows.some((r) => r.entityType === "reconciliation" && r.action === "orphaned_webhook"))
})
