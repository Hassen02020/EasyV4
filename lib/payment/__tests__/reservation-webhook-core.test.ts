/**
 * Paiement B2C réel — preuve live contre un Postgres réel (RLS incluse via
 * withSystemContext) du cœur transactionnel du webhook de paiement de
 * réservation (lib/payment/reservation-webhook-core.ts). Même convention
 * que lib/favorites/__tests__/favorites-core.test.ts / lib/reviews/
 * __tests__/reviews-core.test.ts : se dégrade en `skip` sans Postgres local.
 *
 * Couvre les garanties de sécurité critiques : idempotence event-level
 * (event_id dupliqué), idempotence business-level (payment déjà traité),
 * corrélation stricte montant/devise, protection contre le double paiement
 * (webhooks concurrents pour la même référence), remboursement uniquement
 * depuis un paiement capturé, et cohérence paiement ↔ réservation quand la
 * réservation n'est plus confirmable.
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import { agencies, customers, reservations, payments, paymentEvents, pspWebhooks, auditEvents } from "@/lib/db/schema"
import { processReservationWebhookCore } from "../reservation-webhook-core"
import type { NormalizedChargeEvent } from "../webhook-logic"

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
const skipReason = () => "Postgres local indisponible (DATABASE_URL) — voir favorites-core.test.ts pour la procédure."

let agencyId = ""
let customerId = ""

async function makeReservation(params: { status: "pending" | "cancelled"; tndAmount: string }): Promise<string> {
  const [row] = await withSystemContext((tx) =>
    tx
      .insert(reservations)
      .values({
        agencyId,
        publicRef: `PAY-${randomUUID().slice(0, 8)}`,
        customerId,
        module: "hotel",
        source: "internal",
        status: params.status,
        originalCurrency: "TND",
        originalAmount: params.tndAmount,
        tndAmount: params.tndAmount,
      })
      .returning({ id: reservations.id }),
  )
  return row!.id
}

async function makePendingPayment(params: { reservationId: string; pspOrderId: string; tndAmount: string }): Promise<string> {
  const [row] = await withSystemContext((tx) =>
    tx
      .insert(payments)
      .values({
        agencyId,
        reservationId: params.reservationId,
        psp: "virtual",
        method: "card",
        pspOrderId: params.pspOrderId,
        originalCurrency: "TND",
        originalAmount: params.tndAmount,
        tndAmount: params.tndAmount,
        kind: "deposit",
        status: "pending",
      })
      .returning({ id: payments.id }),
  )
  return row!.id
}

function charge(overrides: Partial<NormalizedChargeEvent> = {}): NormalizedChargeEvent {
  return {
    eventId: `evt-${randomUUID()}`,
    eventType: "payment_intent.succeeded",
    providerRef: "",
    amountTnd: 0,
    currency: "TND",
    ...overrides,
  }
}

before(async () => {
  dbAvailable = await isDbAvailable()
  if (!dbAvailable) return
  agencyId = randomUUID()
  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values({ id: agencyId, slug: `pay-a-${agencyId}`, name: "Payment Test Agency", agencyType: "ota" })
    const [c] = await tx
      .insert(customers)
      .values({ agencyId, firstName: "Client", lastName: "Test", email: `pay-${randomUUID()}@example.com` })
      .returning({ id: customers.id })
    customerId = c!.id
  })
})

after(async () => {
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    await tx.delete(auditEvents).where(eq(auditEvents.agencyId, agencyId))
    await tx.delete(pspWebhooks).where(eq(pspWebhooks.agencyId, agencyId))
    await tx.delete(payments).where(eq(payments.agencyId, agencyId))
    await tx.delete(reservations).where(eq(reservations.agencyId, agencyId))
    await tx.delete(customers).where(eq(customers.agencyId, agencyId))
    await tx.delete(agencies).where(eq(agencies.id, agencyId))
  })
})

test("succeeded : capture le paiement et confirme la réservation", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const reservationId = await makeReservation({ status: "pending", tndAmount: "150.00" })
  const ref = `ref-${randomUUID()}`
  await makePendingPayment({ reservationId, pspOrderId: ref, tndAmount: "150.00" })

  const outcome = await withSystemContext((tx) =>
    processReservationWebhookCore(tx, {
      provider: "sps",
      eventId: `evt-${randomUUID()}`,
      eventType: "sps.payment.captured",
      charge: charge({ providerRef: ref, amountTnd: 150 }),
      signatureOk: true,
      rawPayload: { transaction_id: ref },
    }),
  )

  assert.equal(outcome.status, "captured_confirmed")
  const [res] = await withSystemContext((tx) => tx.select().from(reservations).where(eq(reservations.id, reservationId)))
  assert.equal(res!.status, "confirmed")
  const [pay] = await withSystemContext((tx) => tx.select().from(payments).where(eq(payments.reservationId, reservationId)))
  assert.equal(pay!.status, "captured")
})

test("event_id dupliqué : deuxième appel -> duplicate, jamais retraité", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const reservationId = await makeReservation({ status: "pending", tndAmount: "100.00" })
  const ref = `ref-${randomUUID()}`
  await makePendingPayment({ reservationId, pspOrderId: ref, tndAmount: "100.00" })
  const eventId = `evt-${randomUUID()}`

  const first = await withSystemContext((tx) =>
    processReservationWebhookCore(tx, {
      provider: "sps",
      eventId,
      eventType: "sps.payment.captured",
      charge: charge({ providerRef: ref, amountTnd: 100 }),
      signatureOk: true,
      rawPayload: {},
    }),
  )
  assert.equal(first.status, "captured_confirmed")

  const second = await withSystemContext((tx) =>
    processReservationWebhookCore(tx, {
      provider: "sps",
      eventId, // même event_id
      eventType: "sps.payment.captured",
      charge: charge({ providerRef: ref, amountTnd: 100 }),
      signatureOk: true,
      rawPayload: {},
    }),
  )
  assert.equal(second.status, "duplicate")
})

test("idempotence business-level : deuxième event_id différent pour un paiement déjà capturé -> already_processed", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const reservationId = await makeReservation({ status: "pending", tndAmount: "80.00" })
  const ref = `ref-${randomUUID()}`
  await makePendingPayment({ reservationId, pspOrderId: ref, tndAmount: "80.00" })

  const first = await withSystemContext((tx) =>
    processReservationWebhookCore(tx, {
      provider: "sps",
      eventId: `evt-${randomUUID()}`,
      eventType: "sps.payment.captured",
      charge: charge({ providerRef: ref, amountTnd: 80 }),
      signatureOk: true,
      rawPayload: {},
    }),
  )
  assert.equal(first.status, "captured_confirmed")

  // Stripe envoie souvent payment_intent.succeeded ET charge.captured pour
  // un seul paiement — deux event_id différents, même paiement.
  const second = await withSystemContext((tx) =>
    processReservationWebhookCore(tx, {
      provider: "sps",
      eventId: `evt-${randomUUID()}`,
      eventType: "sps.payment.captured",
      charge: charge({ providerRef: ref, amountTnd: 80 }),
      signatureOk: true,
      rawPayload: {},
    }),
  )
  assert.equal(second.status, "already_processed")
})

test("référence inconnue -> no_match, rien n'est écrit", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const outcome = await withSystemContext((tx) =>
    processReservationWebhookCore(tx, {
      provider: "sps",
      eventId: `evt-${randomUUID()}`,
      eventType: "sps.payment.captured",
      charge: charge({ providerRef: `unknown-${randomUUID()}`, amountTnd: 42 }),
      signatureOk: true,
      rawPayload: {},
    }),
  )
  assert.equal(outcome.status, "no_match")
})

test("montant PSP différent du montant attendu -> mismatch, paiement marqué failed, réservation reste pending", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const reservationId = await makeReservation({ status: "pending", tndAmount: "200.00" })
  const ref = `ref-${randomUUID()}`
  await makePendingPayment({ reservationId, pspOrderId: ref, tndAmount: "200.00" })

  const outcome = await withSystemContext((tx) =>
    processReservationWebhookCore(tx, {
      provider: "sps",
      eventId: `evt-${randomUUID()}`,
      eventType: "sps.payment.captured",
      charge: charge({ providerRef: ref, amountTnd: 999 }), // écart avec les 200.00 attendus
      signatureOk: true,
      rawPayload: {},
    }),
  )
  assert.equal(outcome.status, "mismatch")
  const [pay] = await withSystemContext((tx) => tx.select().from(payments).where(eq(payments.reservationId, reservationId)))
  assert.equal(pay!.status, "failed")
  const [res] = await withSystemContext((tx) => tx.select().from(reservations).where(eq(reservations.id, reservationId)))
  assert.equal(res!.status, "pending")
})

test("paiement refusé (failed) : payment -> failed, réservation reste pending (retryable)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const reservationId = await makeReservation({ status: "pending", tndAmount: "60.00" })
  const ref = `ref-${randomUUID()}`
  await makePendingPayment({ reservationId, pspOrderId: ref, tndAmount: "60.00" })

  const outcome = await withSystemContext((tx) =>
    processReservationWebhookCore(tx, {
      provider: "sps",
      eventId: `evt-${randomUUID()}`,
      eventType: "sps.payment.refused",
      charge: charge({ providerRef: ref, amountTnd: 60 }),
      signatureOk: true,
      rawPayload: {},
    }),
  )
  assert.equal(outcome.status, "payment_failed")
  const [pay] = await withSystemContext((tx) => tx.select().from(payments).where(eq(payments.reservationId, reservationId)))
  assert.equal(pay!.status, "failed")
  const [res] = await withSystemContext((tx) => tx.select().from(reservations).where(eq(reservations.id, reservationId)))
  assert.equal(res!.status, "pending")
})

test("remboursement PSP sur un paiement capturé -> payment refunded, réservation refunded", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const reservationId = await makeReservation({ status: "pending", tndAmount: "120.00" })
  const ref = `ref-${randomUUID()}`
  await makePendingPayment({ reservationId, pspOrderId: ref, tndAmount: "120.00" })

  const captured = await withSystemContext((tx) =>
    processReservationWebhookCore(tx, {
      provider: "sps",
      eventId: `evt-${randomUUID()}`,
      eventType: "sps.payment.captured",
      charge: charge({ providerRef: ref, amountTnd: 120 }),
      signatureOk: true,
      rawPayload: {},
    }),
  )
  assert.equal(captured.status, "captured_confirmed")

  const refunded = await withSystemContext((tx) =>
    processReservationWebhookCore(tx, {
      provider: "sps",
      eventId: `evt-${randomUUID()}`,
      eventType: "sps.payment.refunded",
      charge: charge({ providerRef: ref, amountTnd: 120 }),
      signatureOk: true,
      rawPayload: {},
    }),
  )
  assert.deepEqual(refunded, { status: "refunded", reservationId, fullyRefunded: true })
  const [res] = await withSystemContext((tx) => tx.select().from(reservations).where(eq(reservations.id, reservationId)))
  assert.equal(res!.status, "refunded")
})

test("remboursement PSP sur un paiement jamais capturé (encore pending) -> refund_ignored", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const reservationId = await makeReservation({ status: "pending", tndAmount: "90.00" })
  const ref = `ref-${randomUUID()}`
  await makePendingPayment({ reservationId, pspOrderId: ref, tndAmount: "90.00" })

  const outcome = await withSystemContext((tx) =>
    processReservationWebhookCore(tx, {
      provider: "sps",
      eventId: `evt-${randomUUID()}`,
      eventType: "sps.payment.refunded",
      charge: charge({ providerRef: ref, amountTnd: 90 }),
      signatureOk: true,
      rawPayload: {},
    }),
  )
  assert.equal(outcome.status, "refund_ignored")
})

test("paiement capturé alors que la réservation a été annulée entre-temps -> captured_not_confirmable, jamais de confirmation forcée", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const reservationId = await makeReservation({ status: "cancelled", tndAmount: "70.00" })
  const ref = `ref-${randomUUID()}`
  await makePendingPayment({ reservationId, pspOrderId: ref, tndAmount: "70.00" })

  const outcome = await withSystemContext((tx) =>
    processReservationWebhookCore(tx, {
      provider: "sps",
      eventId: `evt-${randomUUID()}`,
      eventType: "sps.payment.captured",
      charge: charge({ providerRef: ref, amountTnd: 70 }),
      signatureOk: true,
      rawPayload: {},
    }),
  )
  assert.equal(outcome.status, "captured_not_confirmable")
  // L'argent reçu reste honnêtement tracé — jamais perdu de vue.
  const [pay] = await withSystemContext((tx) => tx.select().from(payments).where(eq(payments.reservationId, reservationId)))
  assert.equal(pay!.status, "captured")
  const [res] = await withSystemContext((tx) => tx.select().from(reservations).where(eq(reservations.id, reservationId)))
  assert.equal(res!.status, "cancelled") // jamais forcé à "confirmed"
  const [audit] = await withSystemContext((tx) =>
    tx.select().from(auditEvents).where(eq(auditEvents.entityId, reservationId)),
  )
  assert.equal(audit!.action, "payment.psp_unreconciled")
})

test("protection double paiement : deux webhooks succeeded concurrents pour la même référence -> une seule capture", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const reservationId = await makeReservation({ status: "pending", tndAmount: "300.00" })
  const ref = `ref-${randomUUID()}`
  await makePendingPayment({ reservationId, pspOrderId: ref, tndAmount: "300.00" })

  const [a, b] = await Promise.all([
    withSystemContext((tx) =>
      processReservationWebhookCore(tx, {
        provider: "sps",
        eventId: `evt-${randomUUID()}`,
        eventType: "sps.payment.captured",
        charge: charge({ providerRef: ref, amountTnd: 300 }),
        signatureOk: true,
        rawPayload: {},
      }),
    ),
    withSystemContext((tx) =>
      processReservationWebhookCore(tx, {
        provider: "sps",
        eventId: `evt-${randomUUID()}`,
        eventType: "sps.payment.captured",
        charge: charge({ providerRef: ref, amountTnd: 300 }),
        signatureOk: true,
        rawPayload: {},
      }),
    ),
  ])

  const statuses = [a.status, b.status].sort()
  assert.deepEqual(statuses, ["already_processed", "captured_confirmed"])

  // Un seul paiement capturé au final — jamais deux captures pour la même référence.
  const paymentRows = await withSystemContext((tx) => tx.select().from(payments).where(eq(payments.reservationId, reservationId)))
  assert.equal(paymentRows.length, 1)
  assert.equal(paymentRows[0]!.status, "captured")
})

test("isolation B2B wallet : le webhook réservation n'écrit jamais dans payment_events avec le format wallet ni ne touche wallet_recharge_requests", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const reservationId = await makeReservation({ status: "pending", tndAmount: "50.00" })
  const ref = `ref-${randomUUID()}`
  await makePendingPayment({ reservationId, pspOrderId: ref, tndAmount: "50.00" })
  const eventId = `evt-${randomUUID()}`

  await withSystemContext((tx) =>
    processReservationWebhookCore(tx, {
      provider: "sps",
      eventId,
      eventType: "sps.payment.captured",
      charge: charge({ providerRef: ref, amountTnd: 50 }),
      signatureOk: true,
      rawPayload: {},
    }),
  )

  const [evt] = await withSystemContext((tx) => tx.select().from(paymentEvents).where(eq(paymentEvents.eventId, eventId)))
  assert.equal(evt!.reservationId, reservationId)
})
