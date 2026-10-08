/**
 * ACTION-ENGINE-01 — Static invariants (no DB, no network)
 *
 * Vérifie :
 * 1. Exports du core
 * 2. Logique pure buildActionEngineCore
 *    - priorité dérivée du combinedScore
 *    - canal & type d'action dérivés de la priorité
 *    - urgencyWindow & urgencyHours cohérents
 *    - rationale contient les éléments clés
 *    - campaignHints sérialisable et complet
 *    - ordre d'entrée préservé
 * 3. Exports de l'action
 * 4. Page & navigation
 */

import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { SignalRow } from "../../crm/signal-engine-core.js"

function mkSignal(
  leadId: string,
  firstName: string,
  combinedScore: number,
  vipScore: number,
  signalStrength: number,
  trend: SignalRow["trend"] = "forte_hausse",
  dimension = "Tunis",
  dimensionType: SignalRow["dimensionType"] = "destination",
  growthRate = "+42%",
): SignalRow {
  return {
    signalId: `${leadId}:${dimensionType}:${dimension}`,
    signalType: dimensionType === "destination" ? "vip_x_destination" : "vip_x_product",
    leadId,
    firstName,
    lastName: null,
    contactId: null,
    vipScore,
    leadCount: 1,
    dimension,
    dimensionType,
    trend,
    signalStrength,
    growthRate,
    combinedScore,
    insight: `${firstName} (VIP ${vipScore}) × ${dimension} (${trend} ${growthRate})`,
  }
}

/* -------------------------------------------------------------------------- */
/* Suite 1 — action-engine-core exports                                       */
/* -------------------------------------------------------------------------- */

describe("ACTION-ENGINE-01 / action-engine-core", () => {
  it("exports buildActionEngineCore as a function", async () => {
    const mod = await import("../../crm/action-engine-core.js")
    assert.equal(typeof mod.buildActionEngineCore, "function")
  })

  it("exports ACTION_TYPE_LABEL and PRIORITY_LABEL", async () => {
    const mod = await import("../../crm/action-engine-core.js")
    assert.ok(typeof mod.ACTION_TYPE_LABEL === "object")
    assert.ok(typeof mod.PRIORITY_LABEL === "object")
  })

  it("returns empty array when no signals", async () => {
    const { buildActionEngineCore } = await import("../../crm/action-engine-core.js")
    assert.deepEqual(buildActionEngineCore([]), [])
  })

  it("preserves input order (first signal → first action)", async () => {
    const { buildActionEngineCore } = await import("../../crm/action-engine-core.js")
    const signals = [
      mkSignal("l1", "Alice", 120, 80, 40),
      mkSignal("l2", "Bob", 70, 50, 20),
    ]
    const result = buildActionEngineCore(signals)
    assert.equal(result.length, 2)
    assert.equal(result[0].leadId, "l1")
    assert.equal(result[1].leadId, "l2")
  })

  /* ── Priorité ─────────────────────────────────────────────────── */

  it("combinedScore >= 150 → priority urgent", async () => {
    const { buildActionEngineCore } = await import("../../crm/action-engine-core.js")
    const [action] = buildActionEngineCore([mkSignal("l", "X", 150, 100, 50)])
    assert.equal(action.priority, "urgent")
  })

  it("combinedScore 100–149 → priority haute", async () => {
    const { buildActionEngineCore } = await import("../../crm/action-engine-core.js")
    const [action] = buildActionEngineCore([mkSignal("l", "X", 120, 80, 40)])
    assert.equal(action.priority, "haute")
  })

  it("combinedScore 60–99 → priority normale", async () => {
    const { buildActionEngineCore } = await import("../../crm/action-engine-core.js")
    const [action] = buildActionEngineCore([mkSignal("l", "X", 75, 50, 25)])
    assert.equal(action.priority, "normale")
  })

  it("combinedScore < 60 → priority faible", async () => {
    const { buildActionEngineCore } = await import("../../crm/action-engine-core.js")
    const [action] = buildActionEngineCore([mkSignal("l", "X", 40, 25, 15)])
    assert.equal(action.priority, "faible")
  })

  /* ── Canal & type d'action ─────────────────────────────────────── */

  it("urgent → appel_direct, channel phone, 24h", async () => {
    const { buildActionEngineCore } = await import("../../crm/action-engine-core.js")
    const [action] = buildActionEngineCore([mkSignal("l", "X", 160, 100, 60)])
    assert.equal(action.actionType, "appel_direct")
    assert.equal(action.channel, "phone")
    assert.equal(action.urgencyWindow, "24h")
    assert.equal(action.campaignHints.urgencyHours, 24)
  })

  it("haute → whatsapp_personnalise, channel whatsapp, 48h", async () => {
    const { buildActionEngineCore } = await import("../../crm/action-engine-core.js")
    const [action] = buildActionEngineCore([mkSignal("l", "X", 110, 70, 40)])
    assert.equal(action.actionType, "whatsapp_personnalise")
    assert.equal(action.channel, "whatsapp")
    assert.equal(action.urgencyWindow, "48h")
    assert.equal(action.campaignHints.urgencyHours, 48)
  })

  it("normale → email_personnalise, channel email, 7j", async () => {
    const { buildActionEngineCore } = await import("../../crm/action-engine-core.js")
    const [action] = buildActionEngineCore([mkSignal("l", "X", 80, 55, 25)])
    assert.equal(action.actionType, "email_personnalise")
    assert.equal(action.channel, "email")
    assert.equal(action.urgencyWindow, "7j")
    assert.equal(action.campaignHints.urgencyHours, 168)
  })

  it("faible → email_decouverte, channel email, 14j", async () => {
    const { buildActionEngineCore } = await import("../../crm/action-engine-core.js")
    const [action] = buildActionEngineCore([mkSignal("l", "X", 30, 20, 10)])
    assert.equal(action.actionType, "email_decouverte")
    assert.equal(action.channel, "email")
    assert.equal(action.urgencyWindow, "14j")
    assert.equal(action.campaignHints.urgencyHours, 336)
  })

  /* ── actionId & signalId ───────────────────────────────────────── */

  it("actionId = action:<signalId>", async () => {
    const { buildActionEngineCore } = await import("../../crm/action-engine-core.js")
    const signal = mkSignal("l1", "X", 120, 80, 40)
    const [action] = buildActionEngineCore([signal])
    assert.equal(action.actionId, `action:${signal.signalId}`)
    assert.equal(action.signalId, signal.signalId)
  })

  /* ── Rationale ─────────────────────────────────────────────────── */

  it("rationale mentions VIP score, dimension, growth rate, combinedScore", async () => {
    const { buildActionEngineCore } = await import("../../crm/action-engine-core.js")
    const signal = mkSignal("l1", "Alice", 120, 80, 40, "forte_hausse", "Tunis", "destination", "+42%")
    const [action] = buildActionEngineCore([signal])
    assert.ok(action.rationale.includes("80"))      // vipScore
    assert.ok(action.rationale.includes("Tunis"))   // dimension
    assert.ok(action.rationale.includes("+42%"))    // growthRate
    assert.ok(action.rationale.includes("120"))     // combinedScore
  })

  it("rationale mentions leadCount when > 1", async () => {
    const { buildActionEngineCore } = await import("../../crm/action-engine-core.js")
    const signal: SignalRow = { ...mkSignal("l1", "Alice", 120, 80, 40), leadCount: 3 }
    const [action] = buildActionEngineCore([signal])
    assert.ok(action.rationale.includes("×3") || action.rationale.includes("3 dossiers"))
  })

  /* ── scriptLine ────────────────────────────────────────────────── */

  it("scriptLine mentions VIP first name", async () => {
    const { buildActionEngineCore } = await import("../../crm/action-engine-core.js")
    const [action] = buildActionEngineCore([mkSignal("l1", "Alice", 160, 100, 60)])
    assert.ok(action.scriptLine.includes("Alice"))
  })

  it("scriptLine mentions dimension", async () => {
    const { buildActionEngineCore } = await import("../../crm/action-engine-core.js")
    const [action] = buildActionEngineCore([mkSignal("l1", "Alice", 160, 100, 60, "forte_hausse", "Tunis")])
    assert.ok(action.scriptLine.includes("Tunis"))
  })

  /* ── campaignHints ─────────────────────────────────────────────── */

  it("campaignHints is JSON-serializable", async () => {
    const { buildActionEngineCore } = await import("../../crm/action-engine-core.js")
    const [action] = buildActionEngineCore([mkSignal("l1", "Alice", 120, 80, 40)])
    const serialized = JSON.stringify(action.campaignHints)
    const deserialized = JSON.parse(serialized)
    assert.deepEqual(deserialized, action.campaignHints)
  })

  it("campaignHints.offerDimension matches signal dimension", async () => {
    const { buildActionEngineCore } = await import("../../crm/action-engine-core.js")
    const signal = mkSignal("l1", "Alice", 120, 80, 40, "forte_hausse", "Marrakech")
    const [action] = buildActionEngineCore([signal])
    assert.equal(action.campaignHints.offerDimension, "Marrakech")
    assert.equal(action.campaignHints.offerDimensionType, "destination")
  })

  it("campaignHints.signalStrength matches signal signalStrength", async () => {
    const { buildActionEngineCore } = await import("../../crm/action-engine-core.js")
    const signal = mkSignal("l1", "Alice", 120, 80, 40)
    const [action] = buildActionEngineCore([signal])
    assert.equal(action.campaignHints.signalStrength, 40)
  })

  it("campaignHints.vipScore and leadCount match signal", async () => {
    const { buildActionEngineCore } = await import("../../crm/action-engine-core.js")
    const signal: SignalRow = { ...mkSignal("l1", "Alice", 120, 80, 40), leadCount: 2 }
    const [action] = buildActionEngineCore([signal])
    assert.equal(action.campaignHints.vipScore, 80)
    assert.equal(action.campaignHints.leadCount, 2)
  })

  /* ── offerFocus ────────────────────────────────────────────────── */

  it("offerFocus = 'Destination X' for dimensionType destination", async () => {
    const { buildActionEngineCore } = await import("../../crm/action-engine-core.js")
    const signal = mkSignal("l1", "Alice", 120, 80, 40, "forte_hausse", "Istanbul", "destination")
    const [action] = buildActionEngineCore([signal])
    assert.equal(action.offerFocus, "Destination Istanbul")
  })

  it("offerFocus = product label for dimensionType productType", async () => {
    const { buildActionEngineCore } = await import("../../crm/action-engine-core.js")
    const signal = mkSignal("l1", "Alice", 120, 80, 40, "forte_hausse", "omra", "productType")
    const [action] = buildActionEngineCore([signal])
    assert.equal(action.offerFocus, "Omra")
  })
})

/* -------------------------------------------------------------------------- */
/* Suite 2 — action-engine-actions exports                                    */
/* -------------------------------------------------------------------------- */

describe("ACTION-ENGINE-01 / action-engine-actions", () => {
  it("exports getActionEngine as a function", async () => {
    const mod = await import("../../admin/action-engine-actions.js")
    assert.equal(typeof mod.getActionEngine, "function")
  })
})

/* -------------------------------------------------------------------------- */
/* Suite 3 — page & navigation                                                */
/* -------------------------------------------------------------------------- */

describe("ACTION-ENGINE-01 / page & navigation", () => {
  it("action page file exists", async () => {
    const fs = await import("node:fs/promises")
    await fs.access("/home/user/EasyV4/app/(internal)/admin/analytics/action/page.tsx")
  })

  it("action page imports getActionEngine", async () => {
    const fs = await import("node:fs/promises")
    const content = await fs.readFile(
      "/home/user/EasyV4/app/(internal)/admin/analytics/action/page.tsx",
      "utf-8",
    )
    assert.ok(content.includes("getActionEngine"))
    assert.ok(content.includes("action-engine-actions"))
  })

  it("action page renders rationale and campaignHints", async () => {
    const fs = await import("node:fs/promises")
    const content = await fs.readFile(
      "/home/user/EasyV4/app/(internal)/admin/analytics/action/page.tsx",
      "utf-8",
    )
    assert.ok(content.includes("rationale"))
    assert.ok(content.includes("campaignHints"))
  })

  it("admin-shell includes Actions nav item with /admin/analytics/action href", async () => {
    const fs = await import("node:fs/promises")
    const content = await fs.readFile(
      "/home/user/EasyV4/components/admin-shell.tsx",
      "utf-8",
    )
    assert.ok(content.includes("/admin/analytics/action"))
    assert.ok(content.includes("Actions"))
  })

  it("admin-shell imports Lightbulb icon", async () => {
    const fs = await import("node:fs/promises")
    const content = await fs.readFile(
      "/home/user/EasyV4/components/admin-shell.tsx",
      "utf-8",
    )
    assert.ok(content.includes("Lightbulb"))
  })
})
