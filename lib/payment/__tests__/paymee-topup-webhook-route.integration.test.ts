/**
 * WALLET-PAYMEE-INIT-01 — preuve de bout en bout (hors réseau Paymee) qu'une
 * recharge wallet B2C payée via Paymee est créditée par la route que
 * `createPayment({ purpose: "wallet_topup" })` transmet réellement à Paymee.
 *
 * Seule la dépendance externe est simulée : le webhook Paymee est construit
 * ici (payload + check_sum md5 avec une clé de TEST), exactement au format
 * documenté. Tout le reste est réel : route Next.js
 * app/api/payment/webhook/route.ts, corrélation customer_topup_requests,
 * creditCustomerWallet, Postgres non-bypass-RLS (procédure financial-e2e).
 * Aucun appel au vrai Paymee, aucun paiement réel.
 *
 * Le dernier scénario documente le défaut corrigé : le même webhook livré à
 * l'ancienne cible (reservation-webhook) ne crédite rien.
 */

import test, { before } from "node:test"
import assert from "node:assert/strict"
import { randomInt, randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { NextRequest } from "next/server"

import { withSystemContext } from "@/lib/db/tenant-context"
import { cleanupAsSuperuser } from "@/lib/db/test-helpers/superuser-cleanup"
import {
  agencies,
  customers,
  customerTopupRequests,
  walletAccounts,
  walletLedger,
} from "@/lib/db/schema"
import { computePaymeeChecksum } from "@/lib/payment/paymee-signing"
import { resolvePaymeeWebhookUrl } from "@/lib/payment/paymee-provider"
import { POST as walletWebhookPOST } from "@/app/api/payment/webhook/route"
import { POST as reservationWebhookPOST } from "@/app/api/payment/reservation-webhook/route"

/** Clé de TEST uniquement — jamais une vraie clé Paymee. */
const TEST_PAYMEE_KEY = "itg-paymee-test-key-not-real"

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
  process.env.PAYMEE_API_KEY = TEST_PAYMEE_KEY
})

interface Fixture {
  agencyId: string
  customerId: string
  topupId: string
}

/** Demande pending telle que la crée submitCustomerTopUp :
 * payment_reference = idempotency_key = id (= order_id Paymee). */
async function createFixture(amount: string): Promise<Fixture> {
  const agencyId = randomUUID()
  const customerId = randomUUID()
  const topupId = randomUUID()
  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values({
      id: agencyId,
      slug: `paymee-topup-route-${agencyId.slice(0, 8)}`,
      name: "WALLET-PAYMEE-INIT-01 — agence test",
      agencyType: "ota",
    })
    await tx.insert(customers).values({
      id: customerId,
      agencyId,
      firstName: "Test",
      lastName: "Paymee",
      email: `paymee-topup-route-${customerId.slice(0, 8)}@test.invalid`,
    })
    await tx.insert(customerTopupRequests).values({
      id: topupId,
      customerId,
      agencyId,
      amount,
      status: "pending",
      psp: "paymee",
      paymentReference: topupId,
      idempotencyKey: topupId,
    })
  })
  return { agencyId, customerId, topupId }
}

async function cleanupFixture(f: Fixture): Promise<void> {
  await cleanupAsSuperuser(
    (sql) =>
      sql`delete from wallet_ledger where idempotency_key = ${f.topupId}`,
  )
  await withSystemContext(async (tx) => {
    await tx.execute(
      sql`DELETE FROM payment_events WHERE event_id LIKE 'paymee-transaction-%' AND event_id IN (SELECT 'paymee-transaction-' || (payload->>'transaction_id') FROM psp_webhooks WHERE payload->>'order_id' = ${f.topupId})`,
    )
    await tx.execute(
      sql`DELETE FROM psp_webhooks WHERE payload->>'order_id' = ${f.topupId} OR agency_id = ${f.agencyId}::uuid`,
    )
    await tx
      .delete(walletAccounts)
      .where(eq(walletAccounts.customerId, f.customerId))
    await tx
      .delete(customerTopupRequests)
      .where(eq(customerTopupRequests.id, f.topupId))
    await tx.delete(customers).where(eq(customers.id, f.customerId))
    await tx.delete(agencies).where(eq(agencies.id, f.agencyId))
  })
}

/** Webhook Paymee simulé (format documenté, check_sum valide). */
function paymeeWebhookBody(
  f: Fixture,
  amount: number,
  transactionId: number,
): string {
  const token = `itg-token-${f.topupId.slice(0, 8)}`
  return JSON.stringify({
    token,
    payment_status: true,
    order_id: f.topupId,
    amount,
    transaction_id: transactionId,
    check_sum: computePaymeeChecksum({
      token,
      paymentStatus: true,
      apiKey: TEST_PAYMEE_KEY,
    }),
  })
}

/** Livre le webhook à la route Next.js qui correspond EXACTEMENT à la cible
 * que l'adaptateur Paymee transmet pour une recharge (chemin + query issus de
 * resolvePaymeeWebhookUrl) — comme le ferait Paymee. Une cible erronée est
 * donc réellement livrée à la mauvaise route (et ne crédite rien). */
const ROUTES: Record<string, (req: NextRequest) => Promise<Response>> = {
  "/api/payment/webhook": walletWebhookPOST,
  "/api/payment/reservation-webhook": reservationWebhookPOST,
}

async function deliverTopupWebhook(body: string): Promise<Response> {
  const target = new URL(resolvePaymeeWebhookUrl("wallet_topup"))
  const handler = ROUTES[target.pathname]
  assert.ok(handler, `cible webhook inconnue : ${target.pathname}`)
  return handler(
    new NextRequest(`http://localhost${target.pathname}${target.search}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    }),
  )
}

async function ledgerAndStatus(f: Fixture) {
  return withSystemContext(async (tx) => {
    const ledger = await tx
      .select()
      .from(walletLedger)
      .where(eq(walletLedger.idempotencyKey, f.topupId))
    const [wallet] = await tx
      .select()
      .from(walletAccounts)
      .where(eq(walletAccounts.customerId, f.customerId))
    const [request] = await tx
      .select()
      .from(customerTopupRequests)
      .where(eq(customerTopupRequests.id, f.topupId))
    return {
      ledger,
      balance: wallet?.currentBalance ?? null,
      status: request?.status,
    }
  })
}

test("la cible webhook d'une recharge est la route wallet (pas reservation-webhook)", () => {
  const target = new URL(resolvePaymeeWebhookUrl("wallet_topup"))
  assert.equal(target.pathname, "/api/payment/webhook")
  assert.equal(target.searchParams.get("provider"), "paymee")
})

test("recharge payée : webhook Paymee signé → wallet crédité une seule fois, demande completed", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await createFixture("75.00")
  try {
    const body = paymeeWebhookBody(f, 75, randomInt(1_000_000, 2_000_000_000))
    const res = await deliverTopupWebhook(body)
    assert.equal(res.status, 200)

    const after = await ledgerAndStatus(f)
    assert.equal(after.ledger.length, 1)
    assert.equal(after.ledger[0]!.amount, "75.00")
    assert.equal(after.balance, "75.00")
    assert.equal(after.status, "completed")

    // Rejeu identique (Paymee peut relivrer) : aucun second crédit.
    const replay = await deliverTopupWebhook(body)
    assert.equal(replay.status, 200)
    const afterReplay = await ledgerAndStatus(f)
    assert.equal(afterReplay.ledger.length, 1)
    assert.equal(afterReplay.balance, "75.00")
  } finally {
    await cleanupFixture(f)
  }
})

test("montant différent de la demande : aucun crédit", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await createFixture("40.00")
  try {
    const body = paymeeWebhookBody(f, 400, randomInt(1_000_000, 2_000_000_000))
    await deliverTopupWebhook(body)
    const after = await ledgerAndStatus(f)
    assert.equal(after.ledger.length, 0)
    assert.equal(after.balance, null)
    assert.notEqual(after.status, "completed")
  } finally {
    await cleanupFixture(f)
  }
})

test("signature invalide : aucun crédit", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await createFixture("20.00")
  try {
    const forged = JSON.parse(
      paymeeWebhookBody(f, 20, randomInt(1_000_000, 2_000_000_000)),
    )
    forged.check_sum = "0".repeat(32)
    await deliverTopupWebhook(JSON.stringify(forged))
    const after = await ledgerAndStatus(f)
    assert.equal(after.ledger.length, 0)
    assert.equal(after.status, "pending")
  } finally {
    await cleanupFixture(f)
  }
})

test("défaut corrigé : le même webhook livré à reservation-webhook ne crédite rien", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await createFixture("60.00")
  try {
    const body = paymeeWebhookBody(f, 60, randomInt(1_000_000, 2_000_000_000))
    await reservationWebhookPOST(
      new NextRequest(
        "http://localhost/api/payment/reservation-webhook?provider=paymee",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
        },
      ),
    )
    const after = await ledgerAndStatus(f)
    assert.equal(after.ledger.length, 0)
    assert.equal(after.status, "pending")
  } finally {
    await cleanupFixture(f)
  }
})
