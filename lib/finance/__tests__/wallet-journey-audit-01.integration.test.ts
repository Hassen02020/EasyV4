/**
 * WALLET-JOURNEY-AUDIT-01 — parcours complet wallet B2C, EN UNE SEULE TRACE
 * (même client, même agence), contre un vrai Postgres sous le rôle
 * app_runtime (non-BYPASSRLS, job financial-e2e).
 *
 * Gap trouvé en auditant l'existant (2026-10-26) : chaque maillon de la
 * chaîne a déjà une vraie preuve d'intégration, mais ISOLÉE —
 * `resolveOrCreateLinkedCustomer` (WALLET-GUEST-INTEGRATION-TESTS-01),
 * `createManualTopupRequest`/`reviewManualTopupRequest` (WALLET-B2C-
 * RECHARGE-METHODS-01), `processCustomerTopupWebhookCore` (WALLET-PAYMEE-
 * INIT-01), `debitCustomerWallet` (payment-settlement-chain.integration,
 * débit testé seul). Aucun test existant ne chaîne : profil invité →
 * demande de recharge → validation/confirmation PSP → crédit wallet →
 * réservation → débit → solde final, sur UN client. Ce fichier ferme ce
 * gap en réutilisant EXCLUSIVEMENT les fonctions déjà réelles — aucune
 * nouvelle logique métier.
 *
 * Deux parcours couverts séparément (demande explicite : distinguer
 * recharge manuelle et paiement carte Paymee) :
 *  - Parcours A : virement bancaire (déclaration → validation équipe).
 *  - Parcours B : carte Paymee (session → webhook PSP confirmé).
 *
 * Le débit "réservation" est simulé par un appel direct à
 * `debitCustomerWallet` — exactement la fonction que `lib/booking/
 * guest-actions.ts` appelle quand `paymentMethod === "wallet"` ; rejouer
 * la création réelle d'une réservation hôtel (myGo, price token signé,
 * etc.) sortirait du périmètre de cet audit wallet et dupliquerait des
 * suites déjà réelles ailleurs.
 */

import test, { before } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"

import { withSystemContext, withTenantContext } from "@/lib/db/tenant-context"
import { cleanupAsSuperuser } from "@/lib/db/test-helpers/superuser-cleanup"
import {
  agencies,
  customerTopupRequests,
  walletAccounts,
  walletLedger,
} from "@/lib/db/schema"
import { resolveOrCreateLinkedCustomer } from "@/lib/booking/customer-identity"
import {
  createManualTopupRequest,
  reviewManualTopupRequest,
  saveTopupPaymentMethod,
  type TopupReviewer,
} from "@/lib/finance/customer-topup-manual-core"
import { processCustomerTopupWebhookCore } from "@/lib/payment/customer-topup-webhook-core"
import {
  debitCustomerWallet,
  getCustomerWalletBalance,
} from "@/lib/finance/customer-wallet"

/* -------------------------------------------------------------------------- */
/* DB availability guard — même convention que le reste du job financial-e2e */
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
  "Postgres local indisponible (DATABASE_URL) — voir customer-topup-webhook-core.integration.test.ts pour la procédure."

before(async () => {
  dbAvailable = await isDbAvailable()
})

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

const TEST_PREFIX = "wja01"

interface Fixture {
  agencyId: string
  customerId: string
}

async function createFixture(): Promise<Fixture> {
  const agencyId = randomUUID()
  const customerId = await withSystemContext(async (tx) => {
    await tx.insert(agencies).values({
      id: agencyId,
      slug: `${TEST_PREFIX}-${agencyId.slice(0, 8)}`,
      name: "WALLET-JOURNEY-AUDIT-01 — agence test",
      agencyType: "ota",
    })
    // Étape 1 du parcours : profil invité, réutilise exactement la même
    // fonction que le guest checkout réel (resolveOrCreateLinkedCustomer).
    return resolveOrCreateLinkedCustomer(tx, {
      agencyId,
      traveler: {
        firstName: "WalletJourney",
        lastName: "Audit01",
        email: `${TEST_PREFIX}-${randomUUID().slice(0, 8)}@test.invalid`,
      },
      linkedAuthUserId: null,
    })
  })
  return { agencyId, customerId }
}

async function cleanupFixture(f: Fixture): Promise<void> {
  await cleanupAsSuperuser(async (sql) => {
    await sql`delete from wallet_ledger where wallet_account_id in (select id from wallet_accounts where customer_id = ${f.customerId})`
    await sql`delete from wallet_accounts where customer_id = ${f.customerId}`
    await sql`delete from audit_events where agency_id = ${f.agencyId}`
    await sql`delete from psp_webhooks where agency_id = ${f.agencyId}`
    await sql`delete from customer_topup_requests where customer_id = ${f.customerId}`
    await sql`delete from topup_payment_methods where agency_id = ${f.agencyId}`
    await sql`delete from customers where id = ${f.customerId}`
    await sql`delete from agencies where id = ${f.agencyId}`
  })
}

const superAdmin = (): TopupReviewer => ({
  userId: randomUUID(),
  role: "super_admin",
  agencyId: randomUUID(),
  isSuperAdmin: true,
})

async function ledgerRowsFor(customerId: string) {
  return withSystemContext((tx) =>
    tx
      .select({ type: walletLedger.type, amount: walletLedger.amount })
      .from(walletLedger)
      .innerJoin(
        walletAccounts,
        eq(walletAccounts.id, walletLedger.walletAccountId),
      )
      .where(eq(walletAccounts.customerId, customerId)),
  )
}

/* -------------------------------------------------------------------------- */
/* Parcours A — recharge manuelle (virement bancaire)                         */
/* -------------------------------------------------------------------------- */

test("WALLET-JOURNEY-AUDIT-01 — parcours manuel : profil invité → demande virement → validation → crédit → débit réservation → solde final", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await createFixture()
  try {
    // Étape 2 : moyen de recharge configuré par le Super Admin (préalable
    // obligatoire — un moyen non configuré n'est jamais proposé).
    const methodResult = await withTenantContext(
      { agencyId: null, userId: randomUUID(), isSuperAdmin: true },
      (tx) =>
        saveTopupPaymentMethod(tx, {
          agencyId: f.agencyId,
          actorUserId: randomUUID(),
          method: "bank_transfer",
          enabled: true,
          details: {
            beneficiary: "Bénéficiaire de test",
            bank_name: "Banque de test",
            rib: "00 000 0000000000000 00",
          },
        }),
    )
    assert.equal(methodResult.ok, true)

    // Étape 3 : le client déclare sa recharge (contexte vitrine B2C réel).
    const submitResult = await withTenantContext(
      { agencyId: f.agencyId, userId: "", isSuperAdmin: true },
      (tx) =>
        createManualTopupRequest(tx, {
          agencyId: f.agencyId,
          customerId: f.customerId,
          actorUserId: f.customerId,
          method: "bank_transfer",
          amount: "200.00",
          customerReference: "VIR-WJA01-TEST",
        }),
    )
    assert.equal(submitResult.ok, true, JSON.stringify(submitResult))
    const requestId = (submitResult as { ok: true; requestId: string })
      .requestId

    // Étape 4 : l'équipe vérifie la réception réelle et valide (crédit
    // wallet dans la même transaction que reviewManualTopupRequest).
    const reviewer = superAdmin()
    const reviewResult = await withTenantContext(
      { agencyId: null, userId: reviewer.userId, isSuperAdmin: true },
      (tx) =>
        reviewManualTopupRequest(tx, {
          requestId,
          decision: "approve",
          reviewer,
        }),
    )
    assert.equal(reviewResult.ok, true, JSON.stringify(reviewResult))

    // Étape 5 : solde crédité réel (pas supposé).
    const balanceAfterCredit = await getCustomerWalletBalance(f.customerId)
    assert.equal(balanceAfterCredit, 200)

    // Étape 6 : le client paie une réservation avec son solde wallet — même
    // fonction que lib/booking/guest-actions.ts (paymentMethod === "wallet").
    const fakeReservationId = randomUUID()
    const debit = await debitCustomerWallet({
      customerId: f.customerId,
      amountTnd: 150,
      reservationId: fakeReservationId,
      description: "WALLET-JOURNEY-AUDIT-01 — débit réservation test",
      idempotencyKey: fakeReservationId,
    })
    assert.equal(debit.ok, true, JSON.stringify(debit))

    // Étape 7 : solde final cohérent, un crédit + un débit dans le ledger.
    const finalBalance = await getCustomerWalletBalance(f.customerId)
    assert.equal(finalBalance, 50)

    const ledger = await ledgerRowsFor(f.customerId)
    assert.equal(ledger.length, 2)
    const credit = ledger.find((l) => l.type === "credit")
    const debitRow = ledger.find((l) => l.type === "debit")
    assert.equal(credit?.amount, "200.00")
    assert.equal(debitRow?.amount, "150.00")
  } finally {
    await cleanupFixture(f)
  }
})

/* -------------------------------------------------------------------------- */
/* Parcours B — recharge carte Paymee (webhook PSP)                          */
/* -------------------------------------------------------------------------- */

test("WALLET-JOURNEY-AUDIT-01 — parcours carte : profil invité → session carte → webhook PSP confirmé → crédit → débit réservation → solde final", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await createFixture()
  try {
    // Étape 2 (carte) : la demande "card" pending existe déjà au moment où
    // le client revient de Paymee — créée ici directement (l'initiation
    // réelle de session Paymee est hors périmètre de cet audit wallet,
    // déjà couverte par WALLET-PAYMEE-INIT-01 côté adaptateur HTTP).
    // P0-C (customer-topup-webhook-core.ts) : Paymee exige que le token reçu
    // par le webhook soit celui stocké AVANT que le client reçoive le lien
    // de paiement (submitCustomerTopUp) — anti-fraude, jamais contourné ici.
    const requestId = randomUUID()
    const paymeeToken = `${TEST_PREFIX}-token-${randomUUID()}`
    await withSystemContext((tx) =>
      tx.insert(customerTopupRequests).values({
        id: requestId,
        customerId: f.customerId,
        agencyId: f.agencyId,
        amount: "90.00",
        status: "pending",
        method: "card",
        psp: "paymee",
        paymentReference: requestId,
        idempotencyKey: requestId,
        paymeeToken,
      }),
    )

    // Étape 3 (carte) : confirmation PSP réelle via le webhook — même
    // fonction que app/api/payment/webhook (WALLET-PAYMEE-INIT-01).
    const webhookResult = await withSystemContext((tx) =>
      processCustomerTopupWebhookCore(tx, {
        provider: "paymee",
        eventId: `${TEST_PREFIX}-${randomUUID()}`,
        eventType: "paymee.payment.success",
        charge: {
          eventId: `${TEST_PREFIX}-${randomUUID()}`,
          eventType: "paymee.payment.success",
          providerRef: requestId,
          amountTnd: 90,
          currency: "TND",
        },
        signatureOk: true,
        auditPayload: { test: true, token: paymeeToken },
      }),
    )
    assert.equal(
      webhookResult.status,
      "credited",
      JSON.stringify(webhookResult),
    )

    const balanceAfterCredit = await getCustomerWalletBalance(f.customerId)
    assert.equal(balanceAfterCredit, 90)

    // Étape 4 (carte) : débit réservation, même fonction que le parcours A.
    const fakeReservationId = randomUUID()
    const debit = await debitCustomerWallet({
      customerId: f.customerId,
      amountTnd: 60,
      reservationId: fakeReservationId,
      description: "WALLET-JOURNEY-AUDIT-01 — débit réservation test (carte)",
      idempotencyKey: fakeReservationId,
    })
    assert.equal(debit.ok, true, JSON.stringify(debit))

    const finalBalance = await getCustomerWalletBalance(f.customerId)
    assert.equal(finalBalance, 30)

    const ledger = await ledgerRowsFor(f.customerId)
    assert.equal(ledger.length, 2)
    const credit = ledger.find((l) => l.type === "credit")
    const debitRow = ledger.find((l) => l.type === "debit")
    assert.equal(credit?.amount, "90.00")
    assert.equal(debitRow?.amount, "60.00")
  } finally {
    await cleanupFixture(f)
  }
})
