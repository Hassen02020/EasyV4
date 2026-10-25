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
import { cleanupAsSuperuser } from "@/lib/db/test-helpers/superuser-cleanup"
import {
  agencies,
  customers,
  customerTopupRequests,
  pspWebhooks,
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
  /** Token Paymee de la demande (renvoyé à la création du paiement). */
  token: string
}

async function createFixture(opts: {
  amount: string
  psp: "stripe" | "sps" | "paymee" | null
}): Promise<Fixture> {
  const agencyId = randomUUID()
  const customerId = randomUUID()
  const topupId = randomUUID()
  const providerRef = `b2c-topup-itg-${randomUUID()}`
  const token = `itg-token-${topupId}`

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
      // 0141 : sans PSP, une demande est forcément manuelle (card ⇔ psp).
      method: opts.psp === null ? "bank_transfer" : "card",
      paymeeToken: token,
    })
  })

  return { agencyId, customerId, topupId, providerRef, token }
}

async function cleanupFixture(f: Fixture): Promise<void> {
  // wallet_ledger (0084) est append-only — app_runtime n'a pas DELETE —
  // nettoyage via le superuser, avant wallet_accounts (pas de FK stricte
  // mais même ordre logique que les autres fichiers de ce job).
  await cleanupAsSuperuser(
    (sql) =>
      sql`delete from wallet_ledger where idempotency_key = ${f.topupId}`,
  )
  await withSystemContext(async (tx) => {
    await tx.execute(
      sql`DELETE FROM payment_events WHERE event_id LIKE 'b2c-topup-itg-%'`,
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
        auditPayload: { test: true, token: f.token },
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
      auditPayload: { test: true, token: f.token },
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
        auditPayload: { test: true, token: f.token },
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
        auditPayload: { test: true, token: f.token },
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
        auditPayload: { test: true, token: f.token },
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
        auditPayload: { test: true, token: f.token },
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
        auditPayload: { test: true, token: f.token },
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
/* 7. Concurrence RÉELLE — MÊME eventId, 2 appels simultanés                  */
/* -------------------------------------------------------------------------- */

test("2 webhooks RÉELLEMENT concurrents, MÊME eventId (Promise.all) : exactement 1 crédit", async (t) => {
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
      auditPayload: { test: true, token: f.token },
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

/* -------------------------------------------------------------------------- */
/* 8. Concurrence RÉELLE — eventId DIFFÉRENTS, 2 appels simultanés            */
/* -------------------------------------------------------------------------- */

test("2 webhooks RÉELLEMENT concurrents, eventId DIFFÉRENTS (Promise.all) pour la même demande : exactement 1 crédit", async (t) => {
  if (!dbAvailable) return void t.skip(skip())

  const f = await createFixture({ amount: "75.00", psp: "paymee" })
  try {
    // eventId DIFFÉRENTS cette fois : simule deux livraisons webhook
    // distinctes référant au MÊME paiement (deux notifications PSP
    // indépendantes, pas un simple replay du même événement) — ce scénario
    // n'est PAS protégé par la garde payment_events (eventId différents, donc
    // aucun conflit possible à ce niveau). La seule protection possible est
    // le verrou `SELECT ... FOR UPDATE` sur customerTopupRequests : ce test
    // isole et prouve SA suffisance seule, indépendamment du dédoublonnage
    // par eventId déjà couvert par le test précédent.
    const charge1 = chargeFor(f, 75)
    const charge2: NormalizedChargeEvent = {
      ...charge1,
      eventId: `b2c-topup-itg-${randomUUID()}`,
    }

    const [r1, r2] = await Promise.all([
      withSystemContext((tx) =>
        processCustomerTopupWebhookCore(tx, {
          provider: "paymee",
          eventId: charge1.eventId,
          eventType: charge1.eventType,
          charge: charge1,
          signatureOk: true,
          auditPayload: { test: true, token: f.token },
        }),
      ),
      withSystemContext((tx) =>
        processCustomerTopupWebhookCore(tx, {
          provider: "paymee",
          eventId: charge2.eventId,
          eventType: charge2.eventType,
          charge: charge2,
          signatureOk: true,
          auditPayload: { test: true, token: f.token },
        }),
      ),
    ])

    const statuses = [r1.status, r2.status].sort()
    assert.deepEqual(
      statuses,
      ["already_processed", "credited"],
      "exactement un des deux appels concurrents doit créditer, l'autre doit voir already_processed (via le verrou FOR UPDATE, pas via payment_events)",
    )

    await withSystemContext(async (tx) => {
      const ledgerRows = await tx
        .select()
        .from(walletLedger)
        .where(eq(walletLedger.idempotencyKey, f.topupId))
      assert.equal(
        ledgerRows.length,
        1,
        "un seul crédit réel malgré 2 eventId différents concurrents pour la même demande",
      )

      const [wallet] = await tx
        .select()
        .from(walletAccounts)
        .where(eq(walletAccounts.customerId, f.customerId))
      assert.equal(wallet?.currentBalance, "75.00")
    })
  } finally {
    await cleanupFixture(f)
  }
})

/* -------------------------------------------------------------------------- */
/* Audit #269 — A1 (PSP absent), A2 (token Paymee), A3 (atomicité)            */
/* -------------------------------------------------------------------------- */

async function ledgerFor(f: Fixture) {
  return withSystemContext(async (tx) => {
    const ledger = await tx
      .select()
      .from(walletLedger)
      .where(eq(walletLedger.idempotencyKey, f.topupId))
    const [request] = await tx
      .select()
      .from(customerTopupRequests)
      .where(eq(customerTopupRequests.id, f.topupId))
    const traces = await tx
      .select({ error: pspWebhooks.error })
      .from(pspWebhooks)
      .where(eq(pspWebhooks.agencyId, f.agencyId))
    return { ledger, status: request?.status, traces }
  })
}

test("A1 — demande sans PSP déclaré (psp=null) : jamais créditée par webhook", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await createFixture({ amount: "40.00", psp: null })
  try {
    const charge = chargeFor(f, 40)
    const result = await withSystemContext((tx) =>
      processCustomerTopupWebhookCore(tx, {
        provider: "paymee",
        eventId: charge.eventId,
        eventType: charge.eventType,
        charge,
        signatureOk: true,
        auditPayload: { test: true, token: f.token },
      }),
    )
    assert.equal(result.status, "no_match")
    const s = await ledgerFor(f)
    assert.equal(s.ledger.length, 0)
    assert.equal(s.status, "pending")
    // Après 0141 (#270), la garde « recharge carte uniquement » refuse en
    // premier ; sans elle (#269 seule), la garde PSP_MISSING.
    assert.ok(
      s.traces.some(
        (w) =>
          w.error === "PSP_MISSING" ||
          w.error === "NOT_CARD_TOPUP:method=bank_transfer",
      ),
    )
  } finally {
    await cleanupFixture(f)
  }
})

test("A2 — token Paymee différent de celui de la demande : aucun crédit", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await createFixture({ amount: "45.00", psp: "paymee" })
  try {
    for (const auditPayload of [
      { test: true, token: "token-d-un-autre-paiement" },
      { test: true },
    ]) {
      const charge = chargeFor(f, 45)
      const result = await withSystemContext((tx) =>
        processCustomerTopupWebhookCore(tx, {
          provider: "paymee",
          eventId: charge.eventId,
          eventType: charge.eventType,
          charge,
          signatureOk: true,
          auditPayload,
        }),
      )
      assert.equal(result.status, "no_match")
    }
    const s = await ledgerFor(f)
    assert.equal(s.ledger.length, 0)
    assert.equal(s.status, "pending")
    assert.equal(s.traces.filter((w) => w.error === "TOKEN_MISMATCH").length, 2)

    // Le bon token crédite normalement (eventId non consommé par les refus).
    const charge = chargeFor(f, 45)
    const ok = await withSystemContext((tx) =>
      processCustomerTopupWebhookCore(tx, {
        provider: "paymee",
        eventId: charge.eventId,
        eventType: charge.eventType,
        charge,
        signatureOk: true,
        auditPayload: { test: true, token: f.token },
      }),
    )
    assert.equal(ok.status, "credited")
  } finally {
    await cleanupFixture(f)
  }
})

test("A3 — crédit dans la transaction du webhook : un échec après le crédit annule tout", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await createFixture({ amount: "55.00", psp: "paymee" })
  try {
    const charge = chargeFor(f, 55)
    await assert.rejects(
      withSystemContext(async (tx) => {
        const r = await processCustomerTopupWebhookCore(tx, {
          provider: "paymee",
          eventId: charge.eventId,
          eventType: charge.eventType,
          charge,
          signatureOk: true,
          auditPayload: { test: true, token: f.token },
        })
        assert.equal(r.status, "credited")
        // Échec simulé de la transaction appelante après le traitement.
        throw new Error("ECHEC_SIMULE_APRES_CREDIT")
      }),
      /ECHEC_SIMULE_APRES_CREDIT/,
    )
    const s = await ledgerFor(f)
    assert.equal(
      s.ledger.length,
      0,
      "aucun crédit ne doit survivre au rollback",
    )
    assert.equal(s.status, "pending")

    // Paymee renvoie la notification : crédit unique, demande complétée.
    const retry = await withSystemContext((tx) =>
      processCustomerTopupWebhookCore(tx, {
        provider: "paymee",
        eventId: charge.eventId,
        eventType: charge.eventType,
        charge,
        signatureOk: true,
        auditPayload: { test: true, token: f.token },
      }),
    )
    assert.equal(retry.status, "credited")
    const after = await ledgerFor(f)
    assert.equal(after.ledger.length, 1)
    assert.equal(after.status, "completed")
  } finally {
    await cleanupFixture(f)
  }
})
