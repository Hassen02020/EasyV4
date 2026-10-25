/**
 * WALLET-B2C-RECHARGE-METHODS-01 — recharges wallet B2C manuelles, contre un
 * vrai Postgres sous le rôle app_runtime (non-BYPASSRLS, job financial-e2e).
 *
 * Couvre : configuration des moyens (inactif/incomplet masqué), demande
 * client (montant, précision, plafond de demandes en attente), validation
 * (crédit unique, audit), double validation concurrente, rejet (motif),
 * autorisation du validateur (rôle, agence, permission révoquée), garde du
 * webhook PSP sur une demande manuelle, isolation RLS entre agences.
 *
 * Aucune coordonnée réelle : les RIB/numéros ci-dessous sont des valeurs de
 * test au bon format, sans signification.
 */

import test, { before } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { and, eq, sql } from "drizzle-orm"

import { withSystemContext, withTenantContext } from "@/lib/db/tenant-context"
import { cleanupAsSuperuser } from "@/lib/db/test-helpers/superuser-cleanup"
import {
  agencies,
  auditEvents,
  customers,
  customerTopupRequests,
  permissionGrants,
  pspWebhooks,
  walletAccounts,
  walletLedger,
} from "@/lib/db/schema"
import {
  createManualTopupRequest,
  listCustomerTopupRequests,
  loadAvailableManualMethods,
  MAX_PENDING_MANUAL_TOPUPS,
  reviewManualTopupRequest,
  saveTopupPaymentMethod,
  type TopupReviewer,
} from "@/lib/finance/customer-topup-manual-core"
import { processCustomerTopupWebhookCore } from "@/lib/payment/customer-topup-webhook-core"

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
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const TEST_TRANSFER_DETAILS = {
  beneficiary: "Bénéficiaire de test",
  bank_name: "Banque de test",
  rib: "00 000 0000000000000 00",
}

interface Fixture {
  agencyId: string
  otherAgencyId: string
  customerId: string
  authUserId: string
}

async function createFixture(): Promise<Fixture> {
  const agencyId = randomUUID()
  const otherAgencyId = randomUUID()
  const customerId = randomUUID()
  const authUserId = randomUUID()
  await withSystemContext(async (tx) => {
    for (const id of [agencyId, otherAgencyId]) {
      await tx.insert(agencies).values({
        id,
        slug: `manual-topup-${id.slice(0, 8)}`,
        name: "WALLET-B2C-RECHARGE-METHODS-01 — agence test",
        agencyType: "ota",
      })
    }
    await tx.insert(customers).values({
      id: customerId,
      agencyId,
      firstName: "Test",
      lastName: "Recharge",
      email: `manual-topup-${customerId.slice(0, 8)}@test.invalid`,
      authUserId,
    })
  })
  return { agencyId, otherAgencyId, customerId, authUserId }
}

async function cleanupFixture(f: Fixture): Promise<void> {
  await cleanupAsSuperuser(async (sql) => {
    const agencyIds = [f.agencyId, f.otherAgencyId]
    await sql`delete from wallet_ledger where wallet_account_id in (select id from wallet_accounts where customer_id = ${f.customerId})`
    await sql`delete from wallet_accounts where customer_id = ${f.customerId}`
    await sql`delete from audit_events where agency_id = any(${agencyIds}::uuid[])`
    await sql`delete from psp_webhooks where agency_id = any(${agencyIds}::uuid[])`
    await sql`delete from payment_events where event_id like ${"manual-topup-itg-%"}`
    await sql`delete from permission_grants where agency_id = any(${agencyIds}::uuid[])`
    await sql`delete from customer_topup_requests where customer_id = ${f.customerId}`
    await sql`delete from topup_payment_methods where agency_id = any(${agencyIds}::uuid[])`
    await sql`delete from customers where id = ${f.customerId}`
    await sql`delete from agencies where id = any(${agencyIds}::uuid[])`
  })
}

const superAdmin = (): TopupReviewer => ({
  userId: randomUUID(),
  role: "super_admin",
  agencyId: randomUUID(),
  isSuperAdmin: true,
})

async function configureTransfer(f: Fixture, enabled = true): Promise<void> {
  const result = await withTenantContext(
    { agencyId: null, userId: randomUUID(), isSuperAdmin: true },
    (tx) =>
      saveTopupPaymentMethod(tx, {
        agencyId: f.agencyId,
        actorUserId: randomUUID(),
        method: "bank_transfer",
        enabled,
        details: TEST_TRANSFER_DETAILS,
      }),
  )
  assert.equal(result.ok, true)
}

/** Demande créée comme le fait submitManualTopUp (contexte vitrine B2C). */
async function submit(f: Fixture, amount: unknown, method = "bank_transfer") {
  return withTenantContext(
    { agencyId: f.agencyId, userId: "", isSuperAdmin: true },
    (tx) =>
      createManualTopupRequest(tx, {
        agencyId: f.agencyId,
        customerId: f.customerId,
        actorUserId: f.authUserId,
        method,
        amount,
        customerReference: "VIR-TEST-001",
      }),
  )
}

/** Revue telle que l'exécute b2c-topup-review-actions.ts. */
async function review(
  reviewer: TopupReviewer,
  requestId: string,
  decision: "approve" | "reject",
  reason?: string,
) {
  return withTenantContext(
    {
      agencyId: reviewer.isSuperAdmin ? null : reviewer.agencyId,
      userId: reviewer.userId,
      isSuperAdmin: reviewer.isSuperAdmin,
    },
    (tx) =>
      reviewManualTopupRequest(tx, { requestId, decision, reason, reviewer }),
  )
}

async function state(f: Fixture, requestId: string) {
  return withSystemContext(async (tx) => {
    const ledger = await tx
      .select()
      .from(walletLedger)
      .where(eq(walletLedger.idempotencyKey, requestId))
    const [wallet] = await tx
      .select()
      .from(walletAccounts)
      .where(eq(walletAccounts.customerId, f.customerId))
    const [request] = await tx
      .select()
      .from(customerTopupRequests)
      .where(eq(customerTopupRequests.id, requestId))
    const audit = await tx
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.entityType, "customer_topup"),
          eq(auditEvents.entityId, requestId),
        ),
      )
    return { ledger, balance: wallet?.currentBalance ?? null, request, audit }
  })
}

function requestIdOf(r: Awaited<ReturnType<typeof submit>>): string {
  assert.equal(r.ok, true, JSON.stringify(r))
  return (r as { ok: true; requestId: string }).requestId
}

/* -------------------------------------------------------------------------- */
/* Configuration des moyens                                                   */
/* -------------------------------------------------------------------------- */

test("moyen inactif ou incomplet : jamais proposé ni accepté", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await createFixture()
  try {
    const admin = { agencyId: null, userId: randomUUID(), isSuperAdmin: true }

    // Activer un moyen incomplet est refusé.
    const incomplete = await withTenantContext(admin, (tx) =>
      saveTopupPaymentMethod(tx, {
        agencyId: f.agencyId,
        actorUserId: admin.userId,
        method: "d17",
        enabled: true,
        details: { beneficiary: "Bénéficiaire de test" },
      }),
    )
    assert.deepEqual(incomplete, { ok: false, code: "INCOMPLETE" })

    // Coordonnée mal formée : refusée, jamais ignorée.
    const malformed = await withTenantContext(admin, (tx) =>
      saveTopupPaymentMethod(tx, {
        agencyId: f.agencyId,
        actorUserId: admin.userId,
        method: "bank_transfer",
        enabled: false,
        details: { ...TEST_TRANSFER_DETAILS, rib: "123" },
      }),
    )
    assert.equal(malformed.ok, false)

    // Complet mais inactif : enregistré, non proposé.
    await configureTransfer(f, false)
    const none = await withTenantContext(
      { agencyId: f.agencyId, userId: "", isSuperAdmin: true },
      (tx) => loadAvailableManualMethods(tx, f.agencyId),
    )
    assert.deepEqual(none, [])
    const refused = await submit(f, "50")
    assert.deepEqual(refused, { ok: false, code: "METHOD_UNAVAILABLE" })

    // Actif et complet : proposé avec les coordonnées normalisées.
    await configureTransfer(f, true)
    const available = await withTenantContext(
      { agencyId: f.agencyId, userId: "", isSuperAdmin: true },
      (tx) => loadAvailableManualMethods(tx, f.agencyId),
    )
    assert.equal(available.length, 1)
    assert.equal(available[0]!.method, "bank_transfer")
    assert.equal(available[0]!.details.rib, "00000000000000000000")
  } finally {
    await cleanupFixture(f)
  }
})

test("écriture de la configuration refusée hors super_admin (RLS)", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await createFixture()
  try {
    await assert.rejects(
      withTenantContext(
        { agencyId: f.agencyId, userId: randomUUID(), isSuperAdmin: false },
        (tx) =>
          saveTopupPaymentMethod(tx, {
            agencyId: f.agencyId,
            actorUserId: randomUUID(),
            method: "bank_transfer",
            enabled: true,
            details: TEST_TRANSFER_DETAILS,
          }),
      ),
    )
  } finally {
    await cleanupFixture(f)
  }
})

/* -------------------------------------------------------------------------- */
/* Demande client                                                             */
/* -------------------------------------------------------------------------- */

test("demande : pending, sans PSP ni référence de corrélation, aucun crédit", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await createFixture()
  try {
    await configureTransfer(f)
    const id = requestIdOf(await submit(f, "150,50"))
    const s = await state(f, id)
    assert.equal(s.request?.status, "pending")
    assert.equal(s.request?.method, "bank_transfer")
    assert.equal(s.request?.amount, "150.50")
    assert.equal(s.request?.psp, null)
    assert.equal(s.request?.paymentReference, null)
    assert.equal(s.request?.customerReference, "VIR-TEST-001")
    assert.equal(s.ledger.length, 0)
    assert.equal(s.balance, null)
    assert.equal(
      s.audit.filter((a) => a.action === "customer.topup_requested").length,
      1,
    )
  } finally {
    await cleanupFixture(f)
  }
})

test("montant : précision > 2 décimales et hors limites refusés, jamais tronqués", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await createFixture()
  try {
    await configureTransfer(f)
    assert.deepEqual(await submit(f, "10.005"), {
      ok: false,
      code: "TOO_PRECISE",
    })
    assert.deepEqual(await submit(f, 9.99), { ok: false, code: "OUT_OF_RANGE" })
    assert.deepEqual(await submit(f, "5000.01"), {
      ok: false,
      code: "OUT_OF_RANGE",
    })
    assert.deepEqual(await submit(f, "abc"), {
      ok: false,
      code: "INVALID_AMOUNT",
    })
    const rows = await withSystemContext((tx) =>
      tx
        .select()
        .from(customerTopupRequests)
        .where(eq(customerTopupRequests.customerId, f.customerId)),
    )
    assert.equal(rows.length, 0)
  } finally {
    await cleanupFixture(f)
  }
})

test(`au-delà de ${MAX_PENDING_MANUAL_TOPUPS} demandes en attente : refusé`, async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await createFixture()
  try {
    await configureTransfer(f)
    for (let i = 0; i < MAX_PENDING_MANUAL_TOPUPS; i++) {
      requestIdOf(await submit(f, "20"))
    }
    assert.deepEqual(await submit(f, "20"), {
      ok: false,
      code: "TOO_MANY_PENDING",
    })
  } finally {
    await cleanupFixture(f)
  }
})

/* -------------------------------------------------------------------------- */
/* Validation / rejet                                                         */
/* -------------------------------------------------------------------------- */

test("validation super_admin : 1 écriture ledger, solde exact, statut et audit", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await createFixture()
  try {
    await configureTransfer(f)
    const id = requestIdOf(await submit(f, "120.25"))
    const reviewer = superAdmin()
    const r = await review(reviewer, id, "approve")
    assert.equal(r.ok, true, JSON.stringify(r))

    const s = await state(f, id)
    assert.equal(s.ledger.length, 1)
    assert.equal(s.ledger[0]!.amount, "120.25")
    assert.equal(s.ledger[0]!.type, "credit")
    assert.equal(s.ledger[0]!.category, "recharge")
    assert.equal(s.balance, "120.25")
    assert.equal(s.request?.status, "completed")
    assert.equal(s.request?.reviewedByUserId, reviewer.userId)
    assert.ok(s.request?.reviewedAt)
    const validated = s.audit.filter(
      (a) => a.action === "customer.topup_validated",
    )
    assert.equal(validated.length, 1)
    assert.equal(validated[0]!.actorUserId, reviewer.userId)

    // Revalidation : refusée, aucun second crédit.
    const again = await review(reviewer, id, "approve")
    assert.deepEqual(again, {
      ok: false,
      code: "ALREADY_PROCESSED",
      status: "completed",
    })
    assert.equal((await state(f, id)).ledger.length, 1)
  } finally {
    await cleanupFixture(f)
  }
})

test("2 validations RÉELLEMENT concurrentes : exactement 1 crédit", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await createFixture()
  try {
    await configureTransfer(f)
    const id = requestIdOf(await submit(f, "80"))
    const results = await Promise.all([
      review(superAdmin(), id, "approve"),
      review(superAdmin(), id, "approve"),
    ])
    assert.equal(results.filter((r) => r.ok).length, 1)
    assert.equal(
      results.filter((r) => !r.ok && r.code === "ALREADY_PROCESSED").length,
      1,
    )
    const s = await state(f, id)
    assert.equal(s.ledger.length, 1)
    assert.equal(s.balance, "80.00")
  } finally {
    await cleanupFixture(f)
  }
})

test("validation et rejet concurrents : un seul gagne, cohérent avec le ledger", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await createFixture()
  try {
    await configureTransfer(f)
    const id = requestIdOf(await submit(f, "45"))
    await Promise.all([
      review(superAdmin(), id, "approve"),
      review(superAdmin(), id, "reject", "Virement non reçu"),
    ])
    const s = await state(f, id)
    if (s.request?.status === "completed") {
      assert.equal(s.ledger.length, 1)
    } else {
      assert.equal(s.request?.status, "rejected")
      assert.equal(s.ledger.length, 0)
    }
  } finally {
    await cleanupFixture(f)
  }
})

test("rejet : motif obligatoire ; une demande rejetée ne se valide plus", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await createFixture()
  try {
    await configureTransfer(f)
    const id = requestIdOf(await submit(f, "60"))
    const reviewer = superAdmin()
    assert.deepEqual(await review(reviewer, id, "reject", "  "), {
      ok: false,
      code: "REASON_REQUIRED",
    })
    const r = await review(reviewer, id, "reject", "Virement non reçu")
    assert.equal(r.ok, true)

    const late = await review(reviewer, id, "approve")
    assert.deepEqual(late, {
      ok: false,
      code: "ALREADY_PROCESSED",
      status: "rejected",
    })
    const s = await state(f, id)
    assert.equal(s.request?.status, "rejected")
    assert.equal(s.request?.rejectionReason, "Virement non reçu")
    assert.equal(s.ledger.length, 0)
    assert.equal(s.balance, null)
    assert.equal(
      s.audit.filter((a) => a.action === "customer.topup_rejected").length,
      1,
    )

    // Visible par le client avec son motif.
    const mine = await withTenantContext(
      { agencyId: f.agencyId, userId: "", isSuperAdmin: true },
      (tx) => listCustomerTopupRequests(tx, f.customerId),
    )
    assert.equal(mine[0]?.status, "rejected")
    assert.equal(mine[0]?.rejectionReason, "Virement non reçu")
  } finally {
    await cleanupFixture(f)
  }
})

/* -------------------------------------------------------------------------- */
/* Autorisation du validateur                                                 */
/* -------------------------------------------------------------------------- */

test("agent_compta de l'agence : autorisé", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await createFixture()
  try {
    await configureTransfer(f)
    const id = requestIdOf(await submit(f, "30"))
    const r = await review(
      {
        userId: randomUUID(),
        role: "agent_compta",
        agencyId: f.agencyId,
        isSuperAdmin: false,
      },
      id,
      "approve",
    )
    assert.equal(r.ok, true, JSON.stringify(r))
    assert.equal((await state(f, id)).ledger.length, 1)
  } finally {
    await cleanupFixture(f)
  }
})

test("refusés : agent_compta d'une autre agence, manager, agent_resa, rôle incohérent", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await createFixture()
  try {
    await configureTransfer(f)
    const id = requestIdOf(await submit(f, "30"))

    const otherAgency = await review(
      {
        userId: randomUUID(),
        role: "agent_compta",
        agencyId: f.otherAgencyId,
        isSuperAdmin: false,
      },
      id,
      "approve",
    )
    assert.deepEqual(otherAgency, { ok: false, code: "NOT_FOUND" })

    for (const role of ["manager", "agent_resa", "partner_owner"]) {
      const r = await review(
        {
          userId: randomUUID(),
          role,
          agencyId: f.agencyId,
          isSuperAdmin: false,
        },
        id,
        "approve",
      )
      assert.deepEqual(r, { ok: false, code: "FORBIDDEN" }, role)
    }

    // agent_compta qui se prétend super_admin.
    const spoofed = await review(
      {
        userId: randomUUID(),
        role: "agent_compta",
        agencyId: f.agencyId,
        isSuperAdmin: true,
      },
      id,
      "approve",
    )
    assert.deepEqual(spoofed, { ok: false, code: "FORBIDDEN" })

    const s = await state(f, id)
    assert.equal(s.request?.status, "pending")
    assert.equal(s.ledger.length, 0)
  } finally {
    await cleanupFixture(f)
  }
})

test("agent_compta dont wallet.topup.validate est révoqué : refusé", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await createFixture()
  try {
    await configureTransfer(f)
    const id = requestIdOf(await submit(f, "30"))
    const userId = randomUUID()
    await withSystemContext((tx) =>
      tx.insert(permissionGrants).values({
        agencyId: f.agencyId,
        userId,
        permission: "wallet.topup.validate",
        granted: false,
        grantedByUserId: randomUUID(),
      }),
    )
    const r = await review(
      {
        userId,
        role: "agent_compta",
        agencyId: f.agencyId,
        isSuperAdmin: false,
      },
      id,
      "approve",
    )
    assert.deepEqual(r, { ok: false, code: "FORBIDDEN" })
    assert.equal((await state(f, id)).ledger.length, 0)
  } finally {
    await cleanupFixture(f)
  }
})

test("une recharge carte ne se valide pas manuellement", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await createFixture()
  try {
    const id = randomUUID()
    await withSystemContext((tx) =>
      tx.insert(customerTopupRequests).values({
        id,
        customerId: f.customerId,
        agencyId: f.agencyId,
        amount: "40.00",
        status: "pending",
        method: "card",
        psp: "paymee",
        paymentReference: id,
        idempotencyKey: id,
      }),
    )
    const r = await review(superAdmin(), id, "approve")
    assert.deepEqual(r, { ok: false, code: "NOT_MANUAL" })
    assert.equal((await state(f, id)).ledger.length, 0)
  } finally {
    await cleanupFixture(f)
  }
})

/* -------------------------------------------------------------------------- */
/* Webhook PSP et isolation                                                   */
/* -------------------------------------------------------------------------- */

test("webhook PSP sur une demande manuelle : aucun crédit, tracé NOT_CARD_TOPUP", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await createFixture()
  try {
    await configureTransfer(f)
    const id = requestIdOf(await submit(f, "70"))
    // Défense en profondeur : même si une référence de corrélation était
    // posée sur la demande manuelle, le webhook doit la refuser.
    await cleanupAsSuperuser(
      (sql) =>
        sql`update customer_topup_requests set payment_reference = ${id} where id = ${id}`,
    )
    const result = await withSystemContext((tx) =>
      processCustomerTopupWebhookCore(tx, {
        provider: "paymee",
        eventId: `manual-topup-itg-${randomUUID()}`,
        eventType: "paymee.payment.success",
        charge: {
          eventId: `manual-topup-itg-${randomUUID()}`,
          eventType: "paymee.payment.success",
          providerRef: id,
          amountTnd: 70,
          currency: "TND",
        },
        signatureOk: true,
        auditPayload: { test: true },
      }),
    )
    assert.equal(result.status, "no_match")
    const s = await state(f, id)
    assert.equal(s.request?.status, "pending")
    assert.equal(s.ledger.length, 0)
    const traces = await withSystemContext((tx) =>
      tx
        .select({ error: pspWebhooks.error })
        .from(pspWebhooks)
        .where(eq(pspWebhooks.agencyId, f.agencyId)),
    )
    assert.ok(
      traces.some((w) => w.error === "NOT_CARD_TOPUP:method=bank_transfer"),
    )
  } finally {
    await cleanupFixture(f)
  }
})

test("isolation RLS : une autre agence ne voit ni la demande ni la configuration", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await createFixture()
  try {
    await configureTransfer(f)
    const id = requestIdOf(await submit(f, "25"))
    const other = {
      agencyId: f.otherAgencyId,
      userId: randomUUID(),
      isSuperAdmin: false,
    }
    const seen = await withTenantContext(other, async (tx) => ({
      requests: await tx
        .select()
        .from(customerTopupRequests)
        .where(eq(customerTopupRequests.id, id)),
      methods: await loadAvailableManualMethods(tx, f.agencyId),
    }))
    assert.equal(seen.requests.length, 0)
    assert.equal(seen.methods.length, 0)
  } finally {
    await cleanupFixture(f)
  }
})

/* -------------------------------------------------------------------------- */
/* Séparation des tâches et concurrence côté client                           */
/* -------------------------------------------------------------------------- */

test("un validateur ne traite jamais sa propre demande (profil client lié à son compte)", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await createFixture()
  try {
    await configureTransfer(f)
    const id = requestIdOf(await submit(f, "500"))
    // Même identifiant d'authentification que le client de la fixture.
    for (const reviewer of [
      {
        userId: f.authUserId,
        role: "agent_compta",
        agencyId: f.agencyId,
        isSuperAdmin: false,
      },
      {
        userId: f.authUserId,
        role: "super_admin",
        agencyId: f.agencyId,
        isSuperAdmin: true,
      },
    ]) {
      for (const decision of ["approve", "reject"] as const) {
        const r = await review(reviewer, id, decision, "Motif de test")
        assert.deepEqual(r, { ok: false, code: "SELF_REVIEW" }, reviewer.role)
      }
    }
    const s = await state(f, id)
    assert.equal(s.request?.status, "pending")
    assert.equal(s.ledger.length, 0)
    assert.equal(s.balance, null)
  } finally {
    await cleanupFixture(f)
  }
})

test("rejet par agent_compta (contexte agence, hors super_admin) : statut, motif et audit", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await createFixture()
  try {
    await configureTransfer(f)
    const id = requestIdOf(await submit(f, "35"))
    const reviewer = {
      userId: randomUUID(),
      role: "agent_compta",
      agencyId: f.agencyId,
      isSuperAdmin: false,
    }
    const r = await review(reviewer, id, "reject", "Versement introuvable")
    assert.equal(r.ok, true, JSON.stringify(r))
    const s = await state(f, id)
    assert.equal(s.request?.status, "rejected")
    assert.equal(s.request?.reviewedByUserId, reviewer.userId)
    assert.equal(s.ledger.length, 0)
    const rejected = s.audit.filter(
      (a) => a.action === "customer.topup_rejected",
    )
    assert.equal(rejected.length, 1)
    assert.equal(rejected[0]!.actorUserId, reviewer.userId)
  } finally {
    await cleanupFixture(f)
  }
})

test("déclarations RÉELLEMENT concurrentes : le plafond de demandes en attente tient", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await createFixture()
  try {
    await configureTransfer(f)
    const results = await Promise.all(
      Array.from({ length: MAX_PENDING_MANUAL_TOPUPS + 3 }, () =>
        submit(f, "15"),
      ),
    )
    assert.equal(results.filter((r) => r.ok).length, MAX_PENDING_MANUAL_TOPUPS)
    assert.ok(
      results
        .filter((r) => !r.ok)
        .every((r) => !r.ok && r.code === "TOO_MANY_PENDING"),
    )
    const rows = await withSystemContext((tx) =>
      tx
        .select()
        .from(customerTopupRequests)
        .where(eq(customerTopupRequests.customerId, f.customerId)),
    )
    assert.equal(rows.length, MAX_PENDING_MANUAL_TOPUPS)
  } finally {
    await cleanupFixture(f)
  }
})
