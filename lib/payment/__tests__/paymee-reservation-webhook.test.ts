/**
 * Paymee — preuve DB-mode (Postgres réel, RLS via withSystemContext) du
 * pipeline complet webhook Paymee : check_sum → normalisation
 * (webhook-logic.ts::normalizePaymeeEvent) → cœur transactionnel
 * (reservation-webhook-core.ts, INCHANGÉ pour Paymee — même code que SPS/
 * Stripe, seul le provider diffère). Même convention que
 * reservation-webhook-core.test.ts : se dégrade en `skip` sans Postgres
 * local. Couvre spécifiquement les items du ticket E2B-003 non déjà
 * couverts génériquement par reservation-webhook-core.test.ts (référence
 * inconnue, montant différent, refusé, duplicate, already_processed,
 * replay) — ici avec un payload et une corrélation Paymee réalistes
 * (token/order_id/payment_id), pas un `NormalizedChargeEvent` construit à
 * la main.
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import { agencies, customers, reservations, payments, pspWebhooks, auditEvents } from "@/lib/db/schema"
import { processReservationWebhookCore } from "../reservation-webhook-core"
import { normalizePaymeeEvent } from "../webhook-logic"
import { computePaymeeChecksum, verifyPaymeeChecksum } from "../paymee-signing"

const API_KEY = "test_paymee_key"

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
        publicRef: `PMEE-${randomUUID().slice(0, 8)}`,
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

async function makePendingPayment(params: { reservationId: string; orderId: string; tndAmount: string }): Promise<string> {
  const [row] = await withSystemContext((tx) =>
    tx
      .insert(payments)
      .values({
        agencyId,
        reservationId: params.reservationId,
        psp: "paymee",
        method: "card",
        pspOrderId: params.orderId,
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

/** Construit un webhook Paymee "réel" (payload + check_sum signé), le
 * vérifie EXACTEMENT comme la route le ferait, puis normalise — jamais un
 * `NormalizedChargeEvent` fabriqué à la main pour ces tests-ci. */
function buildSignedPaymeeWebhook(params: {
  orderId: string
  amountTnd: number
  paymentStatus: boolean
  paymentId?: string
}) {
  const token = `tok_${randomUUID()}`
  const checkSum = computePaymeeChecksum({ token, paymentStatus: params.paymentStatus, apiKey: API_KEY })
  const body: Record<string, unknown> = {
    token,
    order_id: params.orderId,
    amount: params.amountTnd,
    payment_status: params.paymentStatus,
    check_sum: checkSum,
    ...(params.paymentId ? { payment_id: params.paymentId } : {}),
  }

  const signatureOk = verifyPaymeeChecksum({
    token,
    paymentStatusRaw: body["payment_status"],
    checkSum: body["check_sum"] as string,
    apiKey: API_KEY,
  })
  const eventType = params.paymentStatus ? "paymee.payment.success" : "paymee.payment.failed"
  const charge = normalizePaymeeEvent(body, eventType)

  return { body, signatureOk, eventType, charge, token }
}

test("verifyPaymeeChecksum + normalizePaymeeEvent : un webhook signé avec une mauvaise clé échoue AVANT même la normalisation (jamais traité)", () => {
  const w = buildSignedPaymeeWebhook({ orderId: "whatever", amountTnd: 10, paymentStatus: true })
  const wrongKeyOk = verifyPaymeeChecksum({
    token: w.token,
    paymentStatusRaw: true,
    checkSum: w.body["check_sum"] as string,
    apiKey: "clé-différente",
  })
  assert.equal(wrongKeyOk, false)
})

before(async () => {
  dbAvailable = await isDbAvailable()
  if (!dbAvailable) return
  agencyId = randomUUID()
  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values({ id: agencyId, slug: `pmee-a-${agencyId}`, name: "Paymee Test Agency", agencyType: "ota" })
    const [c] = await tx
      .insert(customers)
      .values({ agencyId, firstName: "Client", lastName: "Test", email: `pmee-${randomUUID()}@example.com` })
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

test("signature valide + succès : capture le paiement et confirme la réservation (pipeline Paymee complet)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const reservationId = await makeReservation({ status: "pending", tndAmount: "250.000" })
  const orderId = `order-${randomUUID()}`
  await makePendingPayment({ reservationId, orderId, tndAmount: "250.000" })

  const w = buildSignedPaymeeWebhook({ orderId, amountTnd: 250, paymentStatus: true, paymentId: `pmt-${randomUUID()}` })
  assert.equal(w.signatureOk, true)
  assert.ok(w.charge)

  const outcome = await withSystemContext((tx) =>
    processReservationWebhookCore(tx, {
      provider: "paymee",
      eventId: w.charge!.eventId,
      eventType: w.eventType,
      charge: w.charge,
      signatureOk: w.signatureOk,
      rawPayload: w.body,
    }),
  )
  assert.equal(outcome.status, "captured_confirmed")
  const [res] = await withSystemContext((tx) => tx.select().from(reservations).where(eq(reservations.id, reservationId)))
  assert.equal(res!.status, "confirmed")
  const [pay] = await withSystemContext((tx) => tx.select().from(payments).where(eq(payments.reservationId, reservationId)))
  assert.equal(pay!.status, "captured")
  assert.equal(pay!.psp, "paymee")
})

test("mauvais order_id (item 8) -> no_match, rien n'est écrit", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const w = buildSignedPaymeeWebhook({ orderId: `unknown-${randomUUID()}`, amountTnd: 42, paymentStatus: true })
  const outcome = await withSystemContext((tx) =>
    processReservationWebhookCore(tx, {
      provider: "paymee",
      eventId: w.charge!.eventId,
      eventType: w.eventType,
      charge: w.charge,
      signatureOk: w.signatureOk,
      rawPayload: w.body,
    }),
  )
  assert.equal(outcome.status, "no_match")
})

test("montant différent du montant attendu (item 7) -> mismatch, paiement failed, réservation reste pending", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const reservationId = await makeReservation({ status: "pending", tndAmount: "300.000" })
  const orderId = `order-${randomUUID()}`
  await makePendingPayment({ reservationId, orderId, tndAmount: "300.000" })

  const w = buildSignedPaymeeWebhook({ orderId, amountTnd: 999, paymentStatus: true })
  const outcome = await withSystemContext((tx) =>
    processReservationWebhookCore(tx, {
      provider: "paymee",
      eventId: w.charge!.eventId,
      eventType: w.eventType,
      charge: w.charge,
      signatureOk: w.signatureOk,
      rawPayload: w.body,
    }),
  )
  assert.equal(outcome.status, "mismatch")
  const [pay] = await withSystemContext((tx) => tx.select().from(payments).where(eq(payments.reservationId, reservationId)))
  assert.equal(pay!.status, "failed")
})

test("webhook failed (item 11) : payment_status=false -> payment_failed, réservation reste pending (retryable)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const reservationId = await makeReservation({ status: "pending", tndAmount: "60.000" })
  const orderId = `order-${randomUUID()}`
  await makePendingPayment({ reservationId, orderId, tndAmount: "60.000" })

  const w = buildSignedPaymeeWebhook({ orderId, amountTnd: 60, paymentStatus: false })
  const outcome = await withSystemContext((tx) =>
    processReservationWebhookCore(tx, {
      provider: "paymee",
      eventId: w.charge!.eventId,
      eventType: w.eventType,
      charge: w.charge,
      signatureOk: w.signatureOk,
      rawPayload: w.body,
    }),
  )
  assert.equal(outcome.status, "payment_failed")
  const [res] = await withSystemContext((tx) => tx.select().from(reservations).where(eq(reservations.id, reservationId)))
  assert.equal(res!.status, "pending")
})

test("webhook duplicate (item 9) : même notification (même payment_id) reçue deux fois -> duplicate au deuxième appel", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const reservationId = await makeReservation({ status: "pending", tndAmount: "120.000" })
  const orderId = `order-${randomUUID()}`
  await makePendingPayment({ reservationId, orderId, tndAmount: "120.000" })

  const w = buildSignedPaymeeWebhook({ orderId, amountTnd: 120, paymentStatus: true, paymentId: `pmt-${randomUUID()}` })

  const first = await withSystemContext((tx) =>
    processReservationWebhookCore(tx, {
      provider: "paymee",
      eventId: w.charge!.eventId,
      eventType: w.eventType,
      charge: w.charge,
      signatureOk: w.signatureOk,
      rawPayload: w.body,
    }),
  )
  assert.equal(first.status, "captured_confirmed")

  const second = await withSystemContext((tx) =>
    processReservationWebhookCore(tx, {
      provider: "paymee",
      eventId: w.charge!.eventId, // même payment_id -> même eventId déterministe
      eventType: w.eventType,
      charge: w.charge,
      signatureOk: w.signatureOk,
      rawPayload: w.body,
    }),
  )
  assert.equal(second.status, "duplicate")
})

test("webhook success après déjà-captured (item 10) : event_id différent pour le même paiement déjà capturé -> already_processed", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const reservationId = await makeReservation({ status: "pending", tndAmount: "80.000" })
  const orderId = `order-${randomUUID()}`
  await makePendingPayment({ reservationId, orderId, tndAmount: "80.000" })

  const w1 = buildSignedPaymeeWebhook({ orderId, amountTnd: 80, paymentStatus: true, paymentId: `pmt-${randomUUID()}` })
  const first = await withSystemContext((tx) =>
    processReservationWebhookCore(tx, {
      provider: "paymee",
      eventId: w1.charge!.eventId,
      eventType: w1.eventType,
      charge: w1.charge,
      signatureOk: w1.signatureOk,
      rawPayload: w1.body,
    }),
  )
  assert.equal(first.status, "captured_confirmed")

  // Paymee (ou un attaquant qui rejoue une notification passée) renvoie un
  // "succès" pour la même référence, avec un payment_id différent.
  const w2 = buildSignedPaymeeWebhook({ orderId, amountTnd: 80, paymentStatus: true, paymentId: `pmt-${randomUUID()}` })
  const second = await withSystemContext((tx) =>
    processReservationWebhookCore(tx, {
      provider: "paymee",
      eventId: w2.charge!.eventId,
      eventType: w2.eventType,
      charge: w2.charge,
      signatureOk: w2.signatureOk,
      rawPayload: w2.body,
    }),
  )
  assert.equal(second.status, "already_processed")

  const paymentRows = await withSystemContext((tx) => tx.select().from(payments).where(eq(payments.reservationId, reservationId)))
  assert.equal(paymentRows.length, 1)
  assert.equal(paymentRows[0]!.status, "captured")
})

test("replay protection (item 12) : rejouer EXACTEMENT le même webhook déjà traité (même check_sum, même payload) est sans effet", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const reservationId = await makeReservation({ status: "pending", tndAmount: "45.000" })
  const orderId = `order-${randomUUID()}`
  await makePendingPayment({ reservationId, orderId, tndAmount: "45.000" })

  const w = buildSignedPaymeeWebhook({ orderId, amountTnd: 45, paymentStatus: true, paymentId: `pmt-${randomUUID()}` })

  const first = await withSystemContext((tx) =>
    processReservationWebhookCore(tx, {
      provider: "paymee",
      eventId: w.charge!.eventId,
      eventType: w.eventType,
      charge: w.charge,
      signatureOk: w.signatureOk,
      rawPayload: w.body,
    }),
  )
  assert.equal(first.status, "captured_confirmed")

  // Rejeu identique — un attaquant capturant la requête HTTP originale et la
  // renvoyant telle quelle plus tard (même token, même check_sum).
  const replay = await withSystemContext((tx) =>
    processReservationWebhookCore(tx, {
      provider: "paymee",
      eventId: w.charge!.eventId,
      eventType: w.eventType,
      charge: w.charge,
      signatureOk: w.signatureOk,
      rawPayload: w.body,
    }),
  )
  assert.equal(replay.status, "duplicate")

  const [res] = await withSystemContext((tx) => tx.select().from(reservations).where(eq(reservations.id, reservationId)))
  assert.equal(res!.status, "confirmed") // toujours confirmée une seule fois, pas de double-effet
})
