/**
 * WALLET-WEBHOOK-CORE-01 — Tests d'intégration PostgreSQL réels contre
 * lib/payment/wallet-webhook-core.ts. Même convention que
 * lib/payment/__tests__/reservation-webhook-core.test.ts : se dégrade en
 * `skip` sans Postgres local (DATABASE_URL).
 *
 * Couvre les garanties de sécurité critiques :
 *  - Idempotence event-level (event_id dupliqué → duplicate, wallet non re-crédité)
 *  - P0-A : no_match ne consomme pas l'event_id (retry PSP possible)
 *  - P0-B : PSP mismatch ne consomme pas l'event_id, pspWebhooks tracé PSP_MISMATCH
 *  - Idempotence business-level (request déjà validated → already_processed)
 *  - Paiement refusé (failed → request rejected, wallet inchangé)
 *  - Offline (psp=null → tout provider accepté)
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import {
  agencies,
  users,
  walletRechargeRequests,
  paymentEvents,
  pspWebhooks,
  partnerCreditMovements,
} from "@/lib/db/schema"
import { processWalletWebhookCore } from "../wallet-webhook-core"
import type { NormalizedChargeEvent } from "../webhook-logic"

/* -------------------------------------------------------------------------- */
/* DB availability check                                                       */
/* -------------------------------------------------------------------------- */

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
const skipReason = () =>
  "Postgres local indisponible (DATABASE_URL) — voir reservation-webhook-core.test.ts pour la procédure."

/* -------------------------------------------------------------------------- */
/* Shared fixtures                                                             */
/* -------------------------------------------------------------------------- */

let agencyId = ""
let userId = ""

before(async () => {
  dbAvailable = await isDbAvailable()
  if (!dbAvailable) return

  agencyId = randomUUID()
  userId = randomUUID()

  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values({
      id: agencyId,
      slug: `wallet-wh-${agencyId.slice(0, 8)}`,
      name: "Wallet Webhook Test Agency",
      agencyType: "ota",
    })
    await tx.insert(users).values({
      id: userId,
      agencyId,
      email: `wallet-wh-${randomUUID()}@example.com`,
      role: "agent_resa",
    })
  })
})

after(async () => {
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    // Ordre impératif : partner_credit_movements (FK restrict) avant agencies ;
    // walletRechargeRequests avant users (onDelete "set null" + notNull conflict) ;
    // users (FK restrict) avant agencies.
    await tx
      .delete(partnerCreditMovements)
      .where(eq(partnerCreditMovements.agencyId, agencyId))
    await tx.delete(pspWebhooks).where(eq(pspWebhooks.agencyId, agencyId))
    await tx
      .delete(walletRechargeRequests)
      .where(eq(walletRechargeRequests.agencyId, agencyId))
    await tx.delete(users).where(eq(users.agencyId, agencyId))
    await tx.delete(agencies).where(eq(agencies.id, agencyId))
  })
})

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

async function makeRechargeRequest(params: {
  amount: string
  psp: string | null
  paymentReference: string
  status?: "pending" | "validated" | "rejected"
}): Promise<string> {
  const [row] = await withSystemContext((tx) =>
    tx
      .insert(walletRechargeRequests)
      .values({
        agencyId,
        requestedByUserId: userId,
        amount: params.amount,
        method: "card_international",
        psp: params.psp,
        paymentReference: params.paymentReference,
        status: params.status ?? "pending",
      })
      .returning({ id: walletRechargeRequests.id }),
  )
  return row!.id
}

function charge(
  overrides: Partial<NormalizedChargeEvent> = {},
): NormalizedChargeEvent {
  return {
    eventId: `evt-${randomUUID()}`,
    eventType: "paymee.payment.success",
    providerRef: "",
    amountTnd: 0,
    currency: "TND",
    ...overrides,
  }
}

async function readAgencyBalance(): Promise<number> {
  const [row] = await withSystemContext((tx) =>
    tx
      .select({ depositBalance: agencies.depositBalance })
      .from(agencies)
      .where(eq(agencies.id, agencyId)),
  )
  return parseFloat(row!.depositBalance)
}

async function getEventRow(
  eventId: string,
): Promise<{ eventId: string } | undefined> {
  const [row] = await withSystemContext((tx) =>
    tx
      .select({ eventId: paymentEvents.eventId })
      .from(paymentEvents)
      .where(eq(paymentEvents.eventId, eventId)),
  )
  return row
}

/* -------------------------------------------------------------------------- */
/* Tests                                                                       */
/* -------------------------------------------------------------------------- */

test("1. succeeded, psp=paymee, provider=paymee → credited, wallet crédité, pspWebhooks tracé, eventId consommé", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())

  const ref = `ref-1-${randomUUID()}`
  await makeRechargeRequest({
    amount: "500.000",
    psp: "paymee",
    paymentReference: ref,
  })
  const balanceBefore = await readAgencyBalance()
  const evtId = `evt-1-${randomUUID()}`

  const outcome = await withSystemContext((tx) =>
    processWalletWebhookCore(tx, {
      provider: "paymee",
      eventId: evtId,
      eventType: "paymee.payment.success",
      charge: charge({ providerRef: ref, amountTnd: 500.0 }),
      signatureOk: true,
      auditPayload: { token: ref },
    }),
  )

  assert.equal(outcome.status, "credited")
  if (outcome.status === "credited") {
    assert.equal(outcome.agencyId, agencyId)
    assert.equal(outcome.amount, 500)
    assert.ok(typeof outcome.txId === "string" && outcome.txId.length > 0)
  }

  // Wallet crédité
  const balanceAfter = await readAgencyBalance()
  assert.ok(
    Math.abs(balanceAfter - balanceBefore - 500) < 0.001,
    `Solde doit augmenter de 500 TND (avant=${balanceBefore}, après=${balanceAfter})`,
  )

  // pspWebhooks tracé (sans erreur)
  const webhooks = await withSystemContext((tx) =>
    tx.select().from(pspWebhooks).where(eq(pspWebhooks.agencyId, agencyId)),
  )
  const lastWebhook = webhooks.find(
    (w) => w.error === null && w.psp === "paymee",
  )
  assert.ok(lastWebhook, "pspWebhooks doit contenir une entrée sans erreur")

  // eventId consommé
  const evtRow = await getEventRow(evtId)
  assert.ok(evtRow, "eventId doit être consommé dans payment_events")
})

test("2. succeeded, eventId déjà vu → duplicate, wallet NE doit PAS être re-crédité", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())

  const ref = `ref-2-${randomUUID()}`
  await makeRechargeRequest({
    amount: "200.000",
    psp: "paymee",
    paymentReference: ref,
  })
  const evtId = `evt-2-${randomUUID()}`

  const first = await withSystemContext((tx) =>
    processWalletWebhookCore(tx, {
      provider: "paymee",
      eventId: evtId,
      eventType: "paymee.payment.success",
      charge: charge({ providerRef: ref, amountTnd: 200.0 }),
      signatureOk: true,
      auditPayload: {},
    }),
  )
  assert.equal(first.status, "credited")

  const balanceAfterFirst = await readAgencyBalance()

  // Même eventId rejoué
  const second = await withSystemContext((tx) =>
    processWalletWebhookCore(tx, {
      provider: "paymee",
      eventId: evtId,
      eventType: "paymee.payment.success",
      charge: charge({ providerRef: ref, amountTnd: 200.0 }),
      signatureOk: true,
      auditPayload: {},
    }),
  )
  assert.equal(second.status, "duplicate")

  // Wallet inchangé
  const balanceAfterSecond = await readAgencyBalance()
  assert.ok(
    Math.abs(balanceAfterSecond - balanceAfterFirst) < 0.001,
    "Wallet NE doit PAS être re-crédité sur duplicate",
  )
})

test("3. no_match (providerRef inconnu) → no_match, wallet inchangé, eventId NON consommé", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())

  const evtId = `evt-3-${randomUUID()}`
  const balanceBefore = await readAgencyBalance()

  const outcome = await withSystemContext((tx) =>
    processWalletWebhookCore(tx, {
      provider: "paymee",
      eventId: evtId,
      eventType: "paymee.payment.success",
      charge: charge({
        providerRef: `unknown-${randomUUID()}`,
        amountTnd: 100,
      }),
      signatureOk: true,
      auditPayload: {},
    }),
  )
  assert.equal(outcome.status, "no_match")

  // Wallet inchangé
  const balanceAfter = await readAgencyBalance()
  assert.ok(
    Math.abs(balanceAfter - balanceBefore) < 0.001,
    "Wallet ne doit pas changer sur no_match",
  )

  // eventId NON consommé
  const evtRow = await getEventRow(evtId)
  assert.equal(
    evtRow,
    undefined,
    "eventId NE DOIT PAS être consommé sur no_match",
  )
})

test("4. PSP mismatch (psp=paymee, provider=stripe) → no_match, wallet inchangé, eventId NON consommé, pspWebhooks PSP_MISMATCH", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())

  const ref = `ref-4-${randomUUID()}`
  await makeRechargeRequest({
    amount: "300.000",
    psp: "paymee",
    paymentReference: ref,
  })
  const evtId = `evt-4-${randomUUID()}`
  const balanceBefore = await readAgencyBalance()

  const outcome = await withSystemContext((tx) =>
    processWalletWebhookCore(tx, {
      provider: "stripe",
      eventId: evtId,
      eventType: "payment_intent.succeeded",
      charge: charge({ providerRef: ref, amountTnd: 300 }),
      signatureOk: true,
      auditPayload: {},
    }),
  )
  assert.equal(outcome.status, "no_match")

  // Wallet inchangé
  const balanceAfter = await readAgencyBalance()
  assert.ok(
    Math.abs(balanceAfter - balanceBefore) < 0.001,
    "Wallet ne doit pas changer sur PSP mismatch",
  )

  // eventId NON consommé
  const evtRow = await getEventRow(evtId)
  assert.equal(
    evtRow,
    undefined,
    "eventId NE DOIT PAS être consommé sur PSP_MISMATCH",
  )

  // pspWebhooks tracé avec PSP_MISMATCH
  const webhooks = await withSystemContext((tx) =>
    tx.select().from(pspWebhooks).where(eq(pspWebhooks.agencyId, agencyId)),
  )
  const mismatchEntry = webhooks.find(
    (w) => w.error !== null && w.error.startsWith("PSP_MISMATCH"),
  )
  assert.ok(mismatchEntry, "pspWebhooks doit contenir une entrée PSP_MISMATCH")
})

test("5. Retry après no_match (P0-A) — même eventId, cette fois request existe → credited", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())

  const unknownRef = `ref-5-${randomUUID()}`
  const evtId = `evt-5-${randomUUID()}`

  // Premier appel : aucune demande connue → no_match, eventId non consommé
  const first = await withSystemContext((tx) =>
    processWalletWebhookCore(tx, {
      provider: "paymee",
      eventId: evtId,
      eventType: "paymee.payment.success",
      charge: charge({ providerRef: unknownRef, amountTnd: 150 }),
      signatureOk: true,
      auditPayload: {},
    }),
  )
  assert.equal(first.status, "no_match")

  // Vérifier que l'eventId n'a PAS été consommé
  const evtRowAfterNoMatch = await getEventRow(evtId)
  assert.equal(
    evtRowAfterNoMatch,
    undefined,
    "eventId NE DOIT PAS être consommé sur no_match (P0-A)",
  )

  // La DB "rattrape" — on crée maintenant la demande de recharge
  await makeRechargeRequest({
    amount: "150.000",
    psp: "paymee",
    paymentReference: unknownRef,
  })

  // Même eventId rejoué → corrélation réussie → credited
  const second = await withSystemContext((tx) =>
    processWalletWebhookCore(tx, {
      provider: "paymee",
      eventId: evtId,
      eventType: "paymee.payment.success",
      charge: charge({ providerRef: unknownRef, amountTnd: 150 }),
      signatureOk: true,
      auditPayload: {},
    }),
  )
  assert.equal(
    second.status,
    "credited",
    "P0-A : même eventId doit être utilisable après no_match",
  )
})

test("6. failed → request passée en rejected, wallet non crédité", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())

  const ref = `ref-6-${randomUUID()}`
  const reqId = await makeRechargeRequest({
    amount: "100.000",
    psp: "paymee",
    paymentReference: ref,
  })
  const balanceBefore = await readAgencyBalance()

  const outcome = await withSystemContext((tx) =>
    processWalletWebhookCore(tx, {
      provider: "paymee",
      eventId: `evt-6-${randomUUID()}`,
      eventType: "paymee.payment.failed",
      charge: charge({ providerRef: ref, amountTnd: 100 }),
      signatureOk: true,
      auditPayload: {},
    }),
  )
  assert.equal(outcome.status, "payment_failed")

  // Wallet inchangé
  const balanceAfter = await readAgencyBalance()
  assert.ok(
    Math.abs(balanceAfter - balanceBefore) < 0.001,
    "Wallet ne doit pas changer sur payment_failed",
  )

  // Request passée en rejected
  const [req] = await withSystemContext((tx) =>
    tx
      .select({ status: walletRechargeRequests.status })
      .from(walletRechargeRequests)
      .where(eq(walletRechargeRequests.id, reqId)),
  )
  assert.equal(req!.status, "rejected")
})

test("7. succeeded, offline (psp=null) → accepté même si provider=stripe (psp null = offline, toute PSP acceptée)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())

  const ref = `ref-7-${randomUUID()}`
  await makeRechargeRequest({
    amount: "250.000",
    psp: null,
    paymentReference: ref,
  })
  const balanceBefore = await readAgencyBalance()

  const outcome = await withSystemContext((tx) =>
    processWalletWebhookCore(tx, {
      provider: "stripe",
      eventId: `evt-7-${randomUUID()}`,
      eventType: "payment_intent.succeeded",
      charge: charge({ providerRef: ref, amountTnd: 250 }),
      signatureOk: true,
      auditPayload: {},
    }),
  )
  assert.equal(
    outcome.status,
    "credited",
    "psp=null (offline) doit accepter n'importe quel provider",
  )

  // Wallet crédité
  const balanceAfter = await readAgencyBalance()
  assert.ok(
    Math.abs(balanceAfter - balanceBefore - 250) < 0.001,
    `Solde doit augmenter de 250 TND (avant=${balanceBefore}, après=${balanceAfter})`,
  )
})

test("8. already_processed — request déjà validated → already_processed, wallet inchangé", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())

  const ref = `ref-8-${randomUUID()}`
  // Créer une request déjà en status "validated" (déjà traitée par webhook ou admin)
  await makeRechargeRequest({
    amount: "180.000",
    psp: "paymee",
    paymentReference: ref,
    status: "validated",
  })
  const balanceBefore = await readAgencyBalance()

  const outcome = await withSystemContext((tx) =>
    processWalletWebhookCore(tx, {
      provider: "paymee",
      eventId: `evt-8-${randomUUID()}`,
      eventType: "paymee.payment.success",
      charge: charge({ providerRef: ref, amountTnd: 180 }),
      signatureOk: true,
      auditPayload: {},
    }),
  )
  assert.equal(outcome.status, "already_processed")

  // Wallet inchangé
  const balanceAfter = await readAgencyBalance()
  assert.ok(
    Math.abs(balanceAfter - balanceBefore) < 0.001,
    "Wallet ne doit pas changer sur already_processed",
  )
})
