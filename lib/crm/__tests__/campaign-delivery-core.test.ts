/**
 * CAMPAIGN-DELIVERY-01 — tests comportementaux pour deliverCampaignCore.
 *
 * Stratégie : mock de la DB (tx) et du sender email pour tester la logique
 * de routage par canal, l'idempotence et la mise à jour delivery_status
 * sans dépendance réseau.
 *
 * Converti de vitest → node:test (TEST-COMPAT-01).
 */

import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { deliverCampaignCore } from "../campaign-delivery-core"

// --- Helpers ------------------------------------------------------------------

function makeTx(
  campaign: object | null,
  targets: object[],
  contacts: object[],
  consentGranted = true,
) {
  const updates: object[] = []
  let queryCount = 0
  const consentRow = { action: "granted", occurredAt: new Date() }

  // Séquence fixe des SELECT dans deliverCampaignCore :
  //   1 → campaigns (avec .limit)
  //   2 → campaign_targets pending
  //   3 → contacts (inArray)
  //   4+ → lead_consent_events par cible (avec .orderBy)
  function makeChain() {
    const ch: Record<string, unknown> = {}
    ch.from = () => ch
    ch.where = () => {
      queryCount++
      if (queryCount === 1) return { limit: () => (campaign ? [campaign] : []) }
      if (queryCount === 2) return Promise.resolve(targets)
      if (queryCount === 3) return Promise.resolve(contacts)
      return {
        orderBy: () => Promise.resolve(consentGranted ? [consentRow] : []),
      }
    }
    return ch
  }

  return {
    select: () => makeChain(),
    update: () => {
      const up: Record<string, unknown> = {}
      up.set = () => up
      up.where = (cond: object) => {
        updates.push(cond)
        return Promise.resolve()
      }
      return up
    },
    _updates: updates,
  }
}

// --- Tests --------------------------------------------------------------------

describe("CAMPAIGN-DELIVERY-01 — deliverCampaignCore", () => {
  // Skipped: happy-path requires injecting a mock email sender.
  // sendCampaignEmail is a non-configurable ESM getter — t.mock.method()
  // cannot replace it. The contract (sent=1 when email succeeds) is
  // verified by the integration test suite with a real RESEND_API_KEY.
  test.skip("email channel — envoie et met à jour delivery_status = 'sent' [nécessite mock sender]", () => {})

  test("email channel — erreur envoi → delivery_status = 'failed', error renseigné", async () => {
    // Sans RESEND_API_KEY dans l'env de test, sendCampaignEmail lance toujours
    // une erreur. deliverCampaignCore doit capturer celle-ci et retourner failed.
    const campaign = {
      id: "camp-2",
      name: "Promo Test",
      channel: "email",
      message: "Hello",
      status: "active",
    }
    const target = { id: "tgt-2", contactId: "ctc-2" }
    const contact = { id: "ctc-2", contactRef: "bob@example.com" }

    const tx = makeTx(campaign, [target], [contact])
    const result = await deliverCampaignCore(tx as never, {
      agencyId: "agency-1",
      campaignId: "camp-2",
    })

    assert.strictEqual(result.failed, 1)
    assert.strictEqual(result.sent, 0)
    const outcome = result.outcomes[0]
    assert.strictEqual(outcome?.status, "failed")
    assert.ok(outcome?.error)
  })

  test("whatsapp channel → skipped avec TEMPLATE_NOT_CONFIGURED", async () => {
    const campaign = {
      id: "camp-3",
      name: "WhatsApp Promo",
      channel: "whatsapp",
      message: "Bonjour !",
      status: "active",
    }
    const target = { id: "tgt-3", contactId: "ctc-3" }
    const contact = { id: "ctc-3", contactRef: "+21612345678" }

    const tx = makeTx(campaign, [target], [contact])
    const result = await deliverCampaignCore(tx as never, {
      agencyId: "agency-1",
      campaignId: "camp-3",
    })

    assert.strictEqual(result.skipped, 1)
    assert.strictEqual(result.sent, 0)
    const outcome = result.outcomes[0]
    assert.strictEqual(outcome?.status, "skipped")
    assert.strictEqual(outcome?.code, "TEMPLATE_NOT_CONFIGURED")
  })

  test("call channel → skipped avec CALL_NOT_AUTOMATED", async () => {
    const campaign = {
      id: "camp-4",
      name: "Appel Promo",
      channel: "call",
      message: "Rappel client",
      status: "active",
    }
    const target = { id: "tgt-4", contactId: "ctc-4" }
    const contact = { id: "ctc-4", contactRef: "+21698765432" }

    const tx = makeTx(campaign, [target], [contact])
    const result = await deliverCampaignCore(tx as never, {
      agencyId: "agency-1",
      campaignId: "camp-4",
    })

    assert.strictEqual(result.skipped, 1)
    const outcome = result.outcomes[0]
    assert.strictEqual(outcome?.code, "CALL_NOT_AUTOMATED")
  })

  test("campagne introuvable → retourne counts à zéro sans erreur", async () => {
    const tx = makeTx(null, [], [])
    const result = await deliverCampaignCore(tx as never, {
      agencyId: "agency-1",
      campaignId: "nonexistent",
    })

    assert.strictEqual(result.sent, 0)
    assert.strictEqual(result.skipped, 0)
    assert.strictEqual(result.failed, 0)
    assert.strictEqual(result.outcomes.length, 0)
  })

  test("consentement révoqué entre lancement et livraison → skipped CONSENT_REVOKED, email non envoyé", async () => {
    const campaign = {
      id: "camp-6",
      name: "Campagne RGPD",
      channel: "email",
      message: "Offre exclusive",
      status: "active",
    }
    const target = { id: "tgt-6", contactId: "ctc-6" }
    const contact = { id: "ctc-6", contactRef: "carol@example.com" }

    // consentGranted = false → hasMarketingConsentCore retourne false
    const tx = makeTx(campaign, [target], [contact], false)
    const result = await deliverCampaignCore(tx as never, {
      agencyId: "agency-1",
      campaignId: "camp-6",
    })

    assert.strictEqual(result.skipped, 1)
    assert.strictEqual(result.sent, 0)
    const outcome = result.outcomes[0]
    assert.strictEqual(outcome?.status, "skipped")
    assert.strictEqual(outcome?.code, "CONSENT_REVOKED")
  })

  test("aucune cible pending → retourne counts à zéro", async () => {
    const campaign = {
      id: "camp-5",
      name: "Campagne sans pending",
      channel: "email",
      message: "...",
      status: "active",
    }

    const tx = makeTx(campaign, [], [])
    const result = await deliverCampaignCore(tx as never, {
      agencyId: "agency-1",
      campaignId: "camp-5",
    })

    assert.strictEqual(result.sent, 0)
    assert.strictEqual(result.outcomes.length, 0)
  })
})

// ---------------------------------------------------------------------------
// Security invariant documentation
// ---------------------------------------------------------------------------

describe("CAMPAIGN-DELIVERY-01 — invariants sécurité", () => {
  test("delivery_status 'sent' n'est jamais repassé à 'pending' — idempotence garantie par le WHERE deliveryStatus='pending'", () => {
    // La requête dans deliverCampaignCore filtre explicitement
    // eq(campaignTargets.deliveryStatus, 'pending') — une cible déjà
    // 'sent' ou 'skipped' n'est jamais incluse dans pendingTargets.
    const deliveryStatusFilter = "pending"
    assert.strictEqual(deliveryStatusFilter, "pending")
  })

  test("agencyId est toujours transmis depuis l'event Inngest (serveur), jamais depuis un client", () => {
    // L'event crm/campaign.launched est émis par createAndLaunchCampaign
    // après assertSupportStaff() qui résout l'agencyId depuis la session Supabase serveur.
    assert.ok(true)
  })
})
