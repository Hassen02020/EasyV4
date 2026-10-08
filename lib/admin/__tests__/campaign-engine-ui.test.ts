/**
 * CAMPAIGN-ENGINE-01 — Static invariants (no DB, no network)
 *
 * Vérifie :
 * 1. Exports du core — buildCampaignEngineCore
 * 2. Logique pure
 *    - liste vide → tableau vide
 *    - groupement par (channel × dimensionType × dimension)
 *    - champion = action au combinedScore le plus élevé
 *    - déduplication des leadIds
 *    - format proposalId
 *    - mapping ActionChannel → CrmChannel (phone→call)
 *    - priorité héritée du champion
 *    - tri : priorité desc puis score desc
 *    - contenu suggestedName / suggestedObjective / suggestedMessage non-vide
 * 3. Export de l'action getCampaignEngine
 * 4. Page & navigation
 */

import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { ActionRow } from "../../crm/action-engine-core.js"

function mkAction(
  leadId: string,
  channel: "phone" | "whatsapp" | "email",
  dimensionType: "destination" | "productType",
  dimension: string,
  combinedScore: number,
  priority: "urgent" | "haute" | "normale" | "faible" = "normale",
): ActionRow {
  const actionType =
    channel === "phone"
      ? "appel_direct"
      : channel === "whatsapp"
        ? "whatsapp_personnalise"
        : "email_personnalise"
  return {
    actionId: `action:${leadId}:${channel}:${dimension}`,
    signalId: `signal:${leadId}:${dimension}`,
    signalType: "vip_x_destination",
    leadId,
    firstName: `Lead${leadId}`,
    lastName: null,
    contactId: null,
    vipScore: 75,
    leadCount: 1,
    channel,
    dimensionType,
    dimension,
    trend: "hausse",
    growthRate: "+12%",
    offerFocus: dimensionType === "destination" ? `Destination ${dimension}` : dimension,
    priority,
    priorityScore: combinedScore,
    actionType,
    combinedScore,
    urgencyWindow: "7j",
    rationale: `Signal marché sur ${dimension}`,
    scriptLine: `Proposer ${dimension}`,
    subject: `Offre ${dimension}`,
    campaignHints: {
      offerDimension: dimension,
      offerDimensionType: dimensionType,
      suggestedActionType: actionType,
      channel,
      urgencyHours: 48,
      vipScore: 75,
      leadCount: 1,
      marketTrend: "hausse",
      marketGrowthRate: "+12%",
      signalStrength: 5,
    },
  }
}

/* -------------------------------------------------------------------------- */
/* Suite 1 — campaign-engine-core                                              */
/* -------------------------------------------------------------------------- */

describe("CAMPAIGN-ENGINE-01 / campaign-engine-core", () => {
  it("exports buildCampaignEngineCore as a function", async () => {
    const mod = await import("../../crm/campaign-engine-core.js")
    assert.equal(typeof mod.buildCampaignEngineCore, "function")
  })

  /* ── Empty input ───────────────────────────────────────────────── */

  it("returns empty array on empty input", async () => {
    const { buildCampaignEngineCore } = await import("../../crm/campaign-engine-core.js")
    const result = buildCampaignEngineCore([])
    assert.deepEqual(result, [])
  })

  /* ── Single action ─────────────────────────────────────────────── */

  it("returns one proposal from one action", async () => {
    const { buildCampaignEngineCore } = await import("../../crm/campaign-engine-core.js")
    const actions = [mkAction("L1", "whatsapp", "destination", "Tunis", 75)]
    const result = buildCampaignEngineCore(actions)
    assert.equal(result.length, 1)
  })

  /* ── Grouping ──────────────────────────────────────────────────── */

  it("groups two actions with same key into one proposal", async () => {
    const { buildCampaignEngineCore } = await import("../../crm/campaign-engine-core.js")
    const actions = [
      mkAction("L1", "whatsapp", "destination", "Tunis", 75),
      mkAction("L2", "whatsapp", "destination", "Tunis", 60),
    ]
    const result = buildCampaignEngineCore(actions)
    assert.equal(result.length, 1)
    assert.equal(result[0].leadCount, 2)
  })

  it("keeps actions with different channels as separate proposals", async () => {
    const { buildCampaignEngineCore } = await import("../../crm/campaign-engine-core.js")
    const actions = [
      mkAction("L1", "phone", "destination", "Tunis", 75),
      mkAction("L1", "email", "destination", "Tunis", 75),
    ]
    const result = buildCampaignEngineCore(actions)
    assert.equal(result.length, 2)
  })

  it("keeps actions with different dimensions as separate proposals", async () => {
    const { buildCampaignEngineCore } = await import("../../crm/campaign-engine-core.js")
    const actions = [
      mkAction("L1", "whatsapp", "destination", "Tunis", 75),
      mkAction("L2", "whatsapp", "destination", "Marrakech", 60),
    ]
    const result = buildCampaignEngineCore(actions)
    assert.equal(result.length, 2)
  })

  /* ── Champion selection ────────────────────────────────────────── */

  it("champion is the action with highest combinedScore", async () => {
    const { buildCampaignEngineCore } = await import("../../crm/campaign-engine-core.js")
    const actions = [
      mkAction("L1", "whatsapp", "destination", "Tunis", 60, "normale"),
      mkAction("L2", "whatsapp", "destination", "Tunis", 90, "haute"),
    ]
    const result = buildCampaignEngineCore(actions)
    assert.equal(result[0].topCombinedScore, 90)
    assert.equal(result[0].priority, "haute")
  })

  /* ── LeadId deduplication ──────────────────────────────────────── */

  it("leadIds are deduplicated when same leadId appears twice in group", async () => {
    const { buildCampaignEngineCore } = await import("../../crm/campaign-engine-core.js")
    const a1 = mkAction("L1", "whatsapp", "destination", "Tunis", 75)
    const a2 = mkAction("L1", "whatsapp", "destination", "Tunis", 60)
    const result = buildCampaignEngineCore([a1, a2])
    assert.equal(result[0].leadIds.length, 1)
    assert.equal(result[0].leadCount, 1)
  })

  it("leadIds include all distinct leadIds from grouped actions", async () => {
    const { buildCampaignEngineCore } = await import("../../crm/campaign-engine-core.js")
    const actions = [
      mkAction("L1", "email", "destination", "Tunis", 80),
      mkAction("L2", "email", "destination", "Tunis", 70),
      mkAction("L3", "email", "destination", "Tunis", 65),
    ]
    const result = buildCampaignEngineCore(actions)
    assert.equal(result[0].leadIds.length, 3)
  })

  /* ── proposalId format ─────────────────────────────────────────── */

  it("proposalId follows proposal:channel:dimensionType:dimension format", async () => {
    const { buildCampaignEngineCore } = await import("../../crm/campaign-engine-core.js")
    const actions = [mkAction("L1", "phone", "destination", "Tunis", 75)]
    const result = buildCampaignEngineCore(actions)
    assert.equal(result[0].proposalId, "proposal:phone:destination:Tunis")
  })

  /* ── Channel mapping ───────────────────────────────────────────── */

  it("maps phone → call for crmChannel", async () => {
    const { buildCampaignEngineCore } = await import("../../crm/campaign-engine-core.js")
    const actions = [mkAction("L1", "phone", "destination", "Tunis", 75)]
    const result = buildCampaignEngineCore(actions)
    assert.equal(result[0].crmChannel, "call")
  })

  it("maps whatsapp → whatsapp for crmChannel", async () => {
    const { buildCampaignEngineCore } = await import("../../crm/campaign-engine-core.js")
    const actions = [mkAction("L1", "whatsapp", "destination", "Tunis", 75)]
    const result = buildCampaignEngineCore(actions)
    assert.equal(result[0].crmChannel, "whatsapp")
  })

  it("maps email → email for crmChannel", async () => {
    const { buildCampaignEngineCore } = await import("../../crm/campaign-engine-core.js")
    const actions = [mkAction("L1", "email", "destination", "Tunis", 75)]
    const result = buildCampaignEngineCore(actions)
    assert.equal(result[0].crmChannel, "email")
  })

  /* ── Sort order ────────────────────────────────────────────────── */

  it("urgent proposals come before normale proposals", async () => {
    const { buildCampaignEngineCore } = await import("../../crm/campaign-engine-core.js")
    const actions = [
      mkAction("L1", "whatsapp", "destination", "Tunis", 80, "normale"),
      mkAction("L2", "email", "destination", "Paris", 70, "urgent"),
    ]
    const result = buildCampaignEngineCore(actions)
    assert.equal(result[0].priority, "urgent")
    assert.equal(result[1].priority, "normale")
  })

  it("within same priority, higher combinedScore comes first", async () => {
    const { buildCampaignEngineCore } = await import("../../crm/campaign-engine-core.js")
    const actions = [
      mkAction("L1", "whatsapp", "destination", "Tunis", 60, "haute"),
      mkAction("L2", "email", "destination", "Paris", 90, "haute"),
    ]
    const result = buildCampaignEngineCore(actions)
    assert.equal(result[0].topCombinedScore, 90)
  })

  /* ── Content generation ────────────────────────────────────────── */

  it("suggestedName is a non-empty string", async () => {
    const { buildCampaignEngineCore } = await import("../../crm/campaign-engine-core.js")
    const result = buildCampaignEngineCore([mkAction("L1", "phone", "destination", "Tunis", 75)])
    assert.ok(typeof result[0].suggestedName === "string" && result[0].suggestedName.length > 0)
  })

  it("suggestedObjective is a non-empty string containing leadCount", async () => {
    const { buildCampaignEngineCore } = await import("../../crm/campaign-engine-core.js")
    const actions = [
      mkAction("L1", "whatsapp", "destination", "Tunis", 80),
      mkAction("L2", "whatsapp", "destination", "Tunis", 70),
    ]
    const result = buildCampaignEngineCore(actions)
    assert.ok(result[0].suggestedObjective.includes("2"))
  })

  it("suggestedMessage is a non-empty string", async () => {
    const { buildCampaignEngineCore } = await import("../../crm/campaign-engine-core.js")
    const result = buildCampaignEngineCore([mkAction("L1", "email", "destination", "Tunis", 75)])
    assert.ok(typeof result[0].suggestedMessage === "string" && result[0].suggestedMessage.length > 0)
  })

  it("actionCount equals number of actions in group", async () => {
    const { buildCampaignEngineCore } = await import("../../crm/campaign-engine-core.js")
    const actions = [
      mkAction("L1", "email", "destination", "Tunis", 80),
      mkAction("L2", "email", "destination", "Tunis", 70),
      mkAction("L3", "email", "destination", "Tunis", 65),
    ]
    const result = buildCampaignEngineCore(actions)
    assert.equal(result[0].actionCount, 3)
  })
})

/* -------------------------------------------------------------------------- */
/* Suite 2 — campaign-engine-actions exports                                  */
/* -------------------------------------------------------------------------- */

describe("CAMPAIGN-ENGINE-01 / campaign-engine-actions", () => {
  it("exports getCampaignEngine as a function", async () => {
    const mod = await import("../../admin/campaign-engine-actions.js")
    assert.equal(typeof mod.getCampaignEngine, "function")
  })
})

/* -------------------------------------------------------------------------- */
/* Suite 3 — page & navigation                                                */
/* -------------------------------------------------------------------------- */

describe("CAMPAIGN-ENGINE-01 / page & navigation", () => {
  it("campaign-engine page file exists", async () => {
    const fs = await import("node:fs/promises")
    await fs.access(
      "/home/user/EasyV4/app/(internal)/admin/analytics/campaign-engine/page.tsx",
    )
  })

  it("campaign-engine page imports getCampaignEngine", async () => {
    const fs = await import("node:fs/promises")
    const content = await fs.readFile(
      "/home/user/EasyV4/app/(internal)/admin/analytics/campaign-engine/page.tsx",
      "utf-8",
    )
    assert.ok(content.includes("getCampaignEngine"))
    assert.ok(content.includes("campaign-engine-actions"))
  })

  it("campaign-engine page renders proposals and suggestedMessage", async () => {
    const fs = await import("node:fs/promises")
    const content = await fs.readFile(
      "/home/user/EasyV4/app/(internal)/admin/analytics/campaign-engine/page.tsx",
      "utf-8",
    )
    assert.ok(content.includes("proposals"))
    assert.ok(content.includes("suggestedMessage"))
  })

  it("admin-shell includes Campagnes VIP nav item with /admin/analytics/campaign-engine href", async () => {
    const fs = await import("node:fs/promises")
    const content = await fs.readFile(
      "/home/user/EasyV4/components/admin-shell.tsx",
      "utf-8",
    )
    assert.ok(content.includes("/admin/analytics/campaign-engine"))
    assert.ok(content.includes("Campagnes VIP"))
  })

  it("admin-shell imports Send icon", async () => {
    const fs = await import("node:fs/promises")
    const content = await fs.readFile(
      "/home/user/EasyV4/components/admin-shell.tsx",
      "utf-8",
    )
    assert.ok(content.includes("Send"))
  })
})
