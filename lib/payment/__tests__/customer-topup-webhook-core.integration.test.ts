/**
 * B2C-TOPUP-WEBHOOK-INTEGRATION-01 — Tests d'intégration réels (Postgres non-
 * bypass-RLS) pour `processCustomerTopupWebhookCore` (recharge wallet B2C
 * auto-service via PSP, WALLET-TOPUP-01 / migration 0132).
 *
 * Contexte : ce fichier n'avait jusqu'ici AUCUN test, ni mocké ni réel —
 * contrairement à son homologue B2B (`wallet-webhook-core.test.ts`), déjà
 * couvert. Trou de preuve identifié lors de l'audit WALLET-NETWORK-COMMON-
 * FLOW-01 (2026-10-12/13), d'abord vérifié via un script jetable non commité
 * (crédit simple + 2 formes de double-livraison), puis formalisé ici avec les
 * scénarios manquants (erreurs, concurrence réelle).
 *
 * Même convention que `commission-reversal-integration.test.ts` et
 * `payment-settlement-chain.integration.test.ts` : isDbAvailable() dégrade en
 * skip si Postgres local indisponible, fixtures créées/détruites par test,
 * jamais de dépendance à des données de production.
 */

import test, { before } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"

import { withSystemContext } from "@/lib/db/tenant-context"
import {
  agencies,
  customers,
  customerTopupRequests,
  walletAccounts,
  walletLedger,
} from "@/lib/db/schema"
import { processCustomerTopupWebhookCore } from "@/lib/payment/customer-topup-webhook-core"
import type { NormalizedChargeEvent } from "@/lib/payment/webhook-logic"

/* -------------------------------------------------------------------------- */
/* DB availability guard                                                      */
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
const skip = () =>
  "Postgres local indisponible (DATABASE_URL) — voir commission-reversal-integration.test.ts pour la procédure."

before(async () => {
  dbAvailable = await isDbAvailable()
})

/* -------------------------------------------------------------------------- */
/* Fixtures — une agence/un client/une demande de recharge par scénario,      */
/* jamais partagées entre tests, toujours nettoyées.                          */
/* -------------------------------------------------------------------------- */

interface Fixture {
  agencyId: string
  customerId: string
  topupId: string
  providerRef: string
}

async function createFixture(opts: {
  amount: string
  psp: "stripe" | "sps" | "paymee" | null
}): Promise<Fixture> {
  const agencyId = randomUUID()
  const customerId = randomUUID()
  const topupId = randomUUID()
  const providerRef = `b2c-topup-itg-${randomUUID()}`

  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values({
      id: agencyId,
      slug: `b2c-topup-itg-${agencyId.slice(0, 8)}`,
      name: "B2C-TOPUP-WEBHOOK-INTEGRATION-01 — agence test",
      agencyType: "ota",
    })
    await tx.insert(customers).values({
      id: customerId,
      agencyId,
      firstName: "Test",
      lastName: "Integration",
      email: `b2c-topup-itg-${customerId.slice(0, 8)}@test.invalid`,
    })
    await tx.insert(customerTopupRequests).values({
      id: topupId,
      customerId,
      agencyId,
      amount: opts.amount,
      status: "pending",
      paymentReference: providerRef,
      psp: opts.psp,
    })
  })

  return { agencyId, customerId, topupId, providerRef }
}

async function cleanupFixture(f: Fixture): Promise<void> {
  await withSystemContext(async (tx) => {
    await tx.execute(
      sql`DELETE FROM payment_events WHERE event_id LIKE 'b2c-topup-itg-%'`,
    )
    await tx.execute(
      sql`DELETE FROM wallet_ledger WHERE idempotency_key = ${f.topupId}`,
    )
    await tx
      .delete(walletAccounts)
      .where(eq(walletAccounts.customerId, f.customerId))
    await tx.execute(
      sql`DELETE FROM psp_webhooks WHERE agency_id = ${f.agencyId}::uuid`,
    )
    await tx
      .delete(customerTopupRequests)
      .where(eq(customerTopupRequests.id, f.topupId))
    await tx.delete(customers).where(eq(customers.id, f.customerId))
    await tx.delete(agencies).where(eq(agencies.id, f.agencyId))
  })
}

function chargeFor(f: Fixture, amountTnd: number): NormalizedChargeEvent {
  return {
    eventId: `b2c-topup-itg-${randomUUID()}`,
    eventType: "paymee.payment.success",
    providerRef: f.providerRef,
    amountTnd,
    currency: "TND",
  }
}

/* -------------------------------------------------------------------------- */
/* 1. Crédit simple                                                            */
/* -------------------------------------------------------------------------- */

test("crédit simple : 1 ligne wallet_ledger, solde correct, statut completed", async (t) => {
  if (!dbAvailable) return void t.skip(skip())

  const f = await createFixture({ amount: "50.00", psp: "paymee" })
  try {
    const charge = chargeFor(f, 50)
    const result = await withSystemContext((tx) =>
      processCustomerTopupWebhookCore(tx, {
        provider: "paymee",
        eventId: charge.eventId,
        eventType: charge.eventType,
        charge,
        signatureOk: true,
        auditPayload: { test: true },
      }),
    )
    assert.deepEqual(result.status, "credited")

    await withSystemContext(async (tx) => {
      const ledgerRows = await tx
        .select()
        .from(walletLedger)
        .where(eq(walletLedger.idempotencyKey, f.topupId))
      assert.equal(ledgerRows.length, 1)
      assert.equal(ledgerRows[0]!.amount, "50.00")

      const [wallet] = await tx
        .select()
        .from(walletAccounts)
        .where(eq(walletAccounts.customerId, f.customerId))
      assert.equal(wallet?.currentBalance, "50.00")

      const [request] = await tx
        .select()
        .from(customerTopupRequests)
        .where(eq(customerTopupRequests.id, f.topupId))
      assert.equal(request?.status, "completed")
    })
  } finally {
    await cleanupFixture(f)
  }
})

/* -------------------------------------------------------------------------- */
/* 2. Webhook dupliqué — MÊME eventId rejoué                                  */
/* -------------------------------------------------------------------------- */

test("webhook dupliqué (même eventId) : duplicate, 0 second crédit", async (t) => {
  if (!dbAvailable) return void t.skip(skip())

  const f = await createFixture({ amount: "30.00", psp: "paymee" })
  try {
    const charge = chargeFor(f, 30)
    const input = {
      provider: "paymee" as const,
      eventId: charge.eventId,
      eventType: charge.eventType,
      charge,
      signatureOk: true,
      auditPayload: { test: true },
    }

    const result1 = await withSystemContext((tx) =>
      processCustomerTopupWebhookCore(tx, input),
    )
    assert.equal(result1.status, "credited")

    const result2 = await withSystemContext((tx) =>
      processCustomerTopupWebhookCore(tx, input),
    )
    assert.equal(result2.status, "duplicate")

    await withSystemContext(async (tx) => {
      const ledgerRows = await tx
        .select()
        .from(walletLedger)
        .where(eq(walletLedger.idempotencyKey, f.topupId))
      assert.equal(
        ledgerRows.length,
        1,
        "un seul crédit malgré 2 livraisons du même événement",
      )
    })
  } finally {
    await cleanupFixture(f)
  }
})

/* -------------------------------------------------------------------------- */
/* 3. Retry applicatif — eventId DIFFÉRENT, même paymentReference             */
/* -------------------------------------------------------------------------- */

test("retry applicatif (eventId différent, même paymentReference) : already_processed, 0 second crédit", async (t) => {
  if (!dbAvailable) return void t.skip(skip())

  const f = await createFixture({ amount: "20.00", psp: "paymee" })
  try {
    const charge = chargeFor(f, 20)

    const result1 = await withSystemContext((tx) =>
      processCustomerTopupWebhookCore(tx, {
        provider: "paymee",
        eventId: charge.eventId,
        eventType: charge.eventType,
        charge,
        signatureOk: true,
        auditPayload: { test: true },
      }),
    )
    assert.equal(result1.status, "credited")

    const result2 = await withSystemContext((tx) =>
      processCustomerTopupWebhookCore(tx, {
        provider: "paymee",
        eventId: `b2c-topup-itg-${randomUUID()}`, // eventId différent
        eventType: charge.eventType,
        charge, // même providerRef
        signatureOk: true,
        auditPayload: { test: true },
      }),
    )
    assert.equal(result2.status, "already_processed")

    await withSystemContext(async (tx) => {
      const ledgerRows = await tx
        .select()
        .from(walletLedger)
        .where(eq(walletLedger.idempotencyKey, f.topupId))
      assert.equal(ledgerRows.length, 1)
    })
  } finally {
    await cleanupFixture(f)
  }
})

/* -------------------------------------------------------------------------- */
/* 4. Montant incohérent                                                      */
/* -------------------------------------------------------------------------- */

test("montant incohérent : mismatch, statut failed, 0 crédit", async (t) => {
  if (!dbAvailable) return void t.skip(skip())

  const f = await createFixture({ amount: "100.00", psp: "paymee" })
  try {
    const charge = chargeFor(f, 42) // ne correspond pas aux 100.00 attendus
    const result = await withSystemContext((tx) =>
      processCustomerTopupWebhookCore(tx, {
        provider: "paymee",
        eventId: charge.eventId,
        eventType: charge.eventType,
        charge,
        signatureOk: true,
        auditPayload: { test: true },
      }),
    )
    assert.equal(result.status, "mismatch")

    await withSystemContext(async (tx) => {
      const ledgerRows = await tx
        .select()
        .from(walletLedger)
        .where(eq(walletLedger.idempotencyKey, f.topupId))
      assert.equal(ledgerRows.length, 0)

      const [request] = await tx
        .select()
        .from(customerTopupRequests)
        .where(eq(customerTopupRequests.id, f.topupId))
      assert.equal(request?.status, "failed")
    })
  } finally {
    await cleanupFixture(f)
  }
})

/* -------------------------------------------------------------------------- */
/* 5. Paiement refusé côté PSP                                                */
/* -------------------------------------------------------------------------- */

test("paiement refusé (PSP) : statut failed, 0 crédit", async (t) => {
  if (!dbAvailable) return void t.skip(skip())

  const f = await createFixture({ amount: "15.00", psp: "paymee" })
  try {
    const charge = chargeFor(f, 15)
    const result = await withSystemContext((tx) =>
      processCustomerTopupWebhookCore(tx, {
        provider: "paymee",
        eventId: charge.eventId,
        eventType: "paymee.payment.failed",
        charge,
        signatureOk: true,
        auditPayload: { test: true },
      }),
    )
    assert.equal(result.status, "payment_failed")

    await withSystemContext(async (tx) => {
      const [request] = await tx
        .select()
        .from(customerTopupRequests)
        .where(eq(customerTopupRequests.id, f.topupId))
      assert.equal(request?.status, "failed")

      const ledgerRows = await tx
        .select()
        .from(walletLedger)
        .where(eq(walletLedger.idempotencyKey, f.topupId))
      assert.equal(ledgerRows.length, 0)
    })
  } finally {
    await cleanupFixture(f)
  }
})

/* -------------------------------------------------------------------------- */
/* 6. PSP déclaré ≠ PSP du webhook reçu                                       */
/* -------------------------------------------------------------------------- */

test("PSP mismatch (déclaré ≠ webhook reçu) : no_match, tracé dans psp_webhooks", async (t) => {
  if (!dbAvailable) return void t.skip(skip())

  const f = await createFixture({ amount: "25.00", psp: "stripe" }) // déclaré stripe
  try {
    const charge = chargeFor(f, 25)
    const result = await withSystemContext((tx) =>
      processCustomerTopupWebhookCore(tx, {
        provider: "paymee", // webhook reçu d'un PSP différent
        eventId: charge.eventId,
        eventType: charge.eventType,
        charge,
        signatureOk: true,
        auditPayload: { test: true },
      }),
    )
    assert.equal(result.status, "no_match")

    await withSystemContext(async (tx) => {
      const rows = await tx.execute<{ error: string | null }>(sql`
        SELECT error FROM psp_webhooks
        WHERE agency_id = ${f.agencyId}::uuid
        ORDER BY created_at DESC LIMIT 1
      `)
      assert.ok(
        String(rows[0]?.error ?? "").startsWith("PSP_MISMATCH"),
        "psp_webhooks doit tracer le conflit PSP_MISMATCH",
      )

      const ledgerRows = await tx
        .select()
        .from(walletLedger)
        .where(eq(walletLedger.idempotencyKey, f.topupId))
      assert.equal(ledgerRows.length, 0)
    })
  } finally {
    await cleanupFixture(f)
  }
})

/* -------------------------------------------------------------------------- */
/* 7. Concurrence RÉELLE — 2 appels simultanés pour la MÊME demande           */
/* -------------------------------------------------------------------------- */

test("2 webhooks RÉELLEMENT concurrents (Promise.all) pour la même demande : exactement 1 crédit", async (t) => {
  if (!dbAvailable) return void t.skip(skip())

  const f = await createFixture({ amount: "60.00", psp: "paymee" })
  try {
    // Même eventId pour les deux appels : simule la livraison dupliquée d'un
    // seul événement webhook par le PSP, EN PARALLÈLE (pas séquentiel comme
    // le script jetable de l'audit) — c'est le scénario que la garde
    // `ON CONFLICT DO NOTHING` sur payment_events doit fermer sous charge
    // réelle, pas seulement en rejouant l'un après l'autre.
    const charge = chargeFor(f, 60)
    const input = {
      provider: "paymee" as const,
      eventId: charge.eventId,
      eventType: charge.eventType,
      charge,
      signatureOk: true,
      auditPayload: { test: true },
    }

    const [r1, r2] = await Promise.all([
      withSystemContext((tx) => processCustomerTopupWebhookCore(tx, input)),
      withSystemContext((tx) => processCustomerTopupWebhookCore(tx, input)),
    ])

    const statuses = [r1.status, r2.status].sort()
    assert.deepEqual(
      statuses,
      ["credited", "duplicate"],
      "exactement un des deux appels concurrents doit créditer, l'autre doit voir duplicate",
    )

    await withSystemContext(async (tx) => {
      const ledgerRows = await tx
        .select()
        .from(walletLedger)
        .where(eq(walletLedger.idempotencyKey, f.topupId))
      assert.equal(
        ledgerRows.length,
        1,
        "un seul crédit réel malgré 2 appels concurrents",
      )

      const [wallet] = await tx
        .select()
        .from(walletAccounts)
        .where(eq(walletAccounts.customerId, f.customerId))
      assert.equal(wallet?.currentBalance, "60.00")
    })
  } finally {
    await cleanupFixture(f)
  }
})
