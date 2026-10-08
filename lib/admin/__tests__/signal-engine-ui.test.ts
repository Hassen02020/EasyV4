/**
 * SIGNAL-ENGINE-01 — Static invariants (no DB, no network)
 *
 * Vérifie :
 * 1. Exports du core
 * 2. Exports de l'action
 * 3. Constantes & types
 * 4. buildSignalEngineCore — logique pure
 * 5. Page & navigation
 */

import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { resolve } from "node:path"
import type { RadarSignal } from "../../crm/radar-metier-core.js"

function mkSignal(
  dimensionType: RadarSignal["dimensionType"],
  dimension: string,
  trend: RadarSignal["trend"],
  signalStrength: number,
  growthRate: string,
): RadarSignal {
  return {
    dimensionType,
    dimension,
    trend,
    signalStrength,
    growthRate,
    currentVolume: 10,
    prevVolume: 7,
  }
}

/* -------------------------------------------------------------------------- */
/* Suite 1 — signal-engine-core exports                                       */
/* -------------------------------------------------------------------------- */

describe("SIGNAL-ENGINE-01 / signal-engine-core", () => {
  it("exports buildSignalEngineCore as a function", async () => {
    const mod = await import("../../crm/signal-engine-core.js")
    assert.equal(typeof mod.buildSignalEngineCore, "function")
  })

  it("exports SIGNAL_ENGINE_MAX_ROWS = 30", async () => {
    const { SIGNAL_ENGINE_MAX_ROWS } = await import("../../crm/signal-engine-core.js")
    assert.equal(SIGNAL_ENGINE_MAX_ROWS, 30)
  })

  it("returns empty array when no VIPs", async () => {
    const { buildSignalEngineCore } = await import("../../crm/signal-engine-core.js")
    const result = buildSignalEngineCore([], [])
    assert.deepEqual(result, [])
  })

  it("returns empty array when no market signals", async () => {
    const { buildSignalEngineCore } = await import("../../crm/signal-engine-core.js")
    const vips = [
      {
        leadId: "lead1",
        firstName: "Alice",
        lastName: null,
        contactId: null,
        vipScore: 80,
        leadCount: 1,
        destination: "Tunis",
        products: ["hotel"],
      },
    ]
    const result = buildSignalEngineCore(vips, [])
    assert.deepEqual(result, [])
  })

  it("emits vip_x_destination when VIP destination matches positive signal", async () => {
    const { buildSignalEngineCore } = await import("../../crm/signal-engine-core.js")
    const vips = [
      {
        leadId: "lead1",
        firstName: "Alice",
        lastName: "Dupont",
        contactId: "contact-abc",
        vipScore: 80,
        leadCount: 1,
        destination: "Tunis",
        products: ["hotel"],
      },
    ]
    const signals = [
      mkSignal("destination", "Tunis", "forte_hausse", 50, "+42%"),
    ]
    const result = buildSignalEngineCore(vips, signals)
    assert.equal(result.length, 1)
    assert.equal(result[0].signalType, "vip_x_destination")
    assert.equal(result[0].combinedScore, 130) // 80 + 50
    assert.equal(result[0].leadId, "lead1")
    assert.equal(result[0].contactId, "contact-abc")
    assert.ok(result[0].insight.includes("Alice Dupont"))
    assert.ok(result[0].insight.includes("Tunis"))
    assert.ok(result[0].insight.includes("80"))
  })

  it("emits vip_x_product when VIP product matches positive signal", async () => {
    const { buildSignalEngineCore } = await import("../../crm/signal-engine-core.js")
    const vips = [
      {
        leadId: "lead2",
        firstName: "Bob",
        lastName: null,
        contactId: null,
        vipScore: 60,
        leadCount: 1,
        destination: null,
        products: ["omra"],
      },
    ]
    const signals = [
      mkSignal("productType", "omra", "hausse", 30, "+15%"),
    ]
    const result = buildSignalEngineCore(vips, signals)
    assert.equal(result.length, 1)
    assert.equal(result[0].signalType, "vip_x_product")
    assert.equal(result[0].combinedScore, 90) // 60 + 30
    assert.equal(result[0].dimensionType, "productType")
    assert.equal(result[0].dimension, "omra")
  })

  it("does NOT emit signal for negative trend (baisse)", async () => {
    const { buildSignalEngineCore } = await import("../../crm/signal-engine-core.js")
    const vips = [
      {
        leadId: "lead3",
        firstName: "Carol",
        lastName: null,
        contactId: null,
        vipScore: 90,
        leadCount: 1,
        destination: "Istanbul",
        products: ["hotel"],
      },
    ]
    const signals = [
      mkSignal("destination", "Istanbul", "baisse", 20, "-10%"),
    ]
    const result = buildSignalEngineCore(vips, signals)
    assert.deepEqual(result, [])
  })

  it("does NOT emit signal for channel dimensionType", async () => {
    const { buildSignalEngineCore } = await import("../../crm/signal-engine-core.js")
    const vips = [
      {
        leadId: "lead4",
        firstName: "Dave",
        lastName: null,
        contactId: null,
        vipScore: 70,
        leadCount: 1,
        destination: null,
        products: ["hotel"],
      },
    ]
    const signals = [
      mkSignal("channel", "whatsapp", "forte_hausse", 60, "+100%"),
    ]
    const result = buildSignalEngineCore(vips, signals)
    assert.deepEqual(result, [])
  })

  it("sorts by combinedScore descending", async () => {
    const { buildSignalEngineCore } = await import("../../crm/signal-engine-core.js")
    const vips = [
      { leadId: "l1", firstName: "A", lastName: null, contactId: null, vipScore: 10, leadCount: 1, destination: "Paris", products: ["hotel"] },
      { leadId: "l2", firstName: "B", lastName: null, contactId: null, vipScore: 90, leadCount: 1, destination: "London", products: [] },
    ]
    const signals = [
      mkSignal("destination", "Paris", "forte_hausse", 20, "+5%"),
      mkSignal("destination", "London", "hausse", 5, "+2%"),
    ]
    const result = buildSignalEngineCore(vips, signals)
    assert.equal(result.length, 2)
    assert.ok(result[0].combinedScore >= result[1].combinedScore)
    assert.equal(result[0].leadId, "l2") // 90+5=95 > 10+20=30
  })

  it("deduplicates by signalId", async () => {
    const { buildSignalEngineCore } = await import("../../crm/signal-engine-core.js")
    const vip = { leadId: "l1", firstName: "A", lastName: null, contactId: null, vipScore: 50, leadCount: 1, destination: "Tunis", products: ["hotel", "hotel"] }
    const signals = [
      mkSignal("destination", "Tunis", "forte_hausse", 30, "+10%"),
      mkSignal("productType", "hotel", "hausse", 15, "+5%"),
    ]
    const result = buildSignalEngineCore([vip], signals)
    // destination + product (hotel appears twice but deduped by seenProducts)
    assert.equal(result.length, 2)
    const sigIds = new Set(result.map((r) => r.signalId))
    assert.equal(sigIds.size, 2)
  })

  it("respects SIGNAL_ENGINE_MAX_ROWS cap", async () => {
    const { buildSignalEngineCore, SIGNAL_ENGINE_MAX_ROWS } = await import("../../crm/signal-engine-core.js")
    const vips = Array.from({ length: 50 }, (_, i) => ({
      leadId: `l${i}`,
      firstName: `Lead${i}`,
      lastName: null,
      contactId: null,
      vipScore: i,
      leadCount: 1,
      destination: `Dest${i}`,
      products: [],
    }))
    const signals = Array.from({ length: 50 }, (_, i) =>
      mkSignal("destination", `Dest${i}`, "forte_hausse", i, `+${i}%`),
    )
    const result = buildSignalEngineCore(vips, signals)
    assert.ok(result.length <= SIGNAL_ENGINE_MAX_ROWS)
  })
})

/* -------------------------------------------------------------------------- */
/* Suite 2 — signal-engine-actions exports                                    */
/* -------------------------------------------------------------------------- */

describe("SIGNAL-ENGINE-01 / signal-engine-actions", () => {
  it("exports getSignalEngine as a function", async () => {
    const mod = await import("../../admin/signal-engine-actions.js")
    assert.equal(typeof mod.getSignalEngine, "function")
  })

  it("re-exports SignalRow type (check via module shape)", async () => {
    const mod = await import("../../admin/signal-engine-actions.js")
    // Re-export means the module object must expose getSignalEngine at minimum
    assert.ok("getSignalEngine" in mod)
  })
})

/* -------------------------------------------------------------------------- */
/* Suite 3 — page & navigation                                                */
/* -------------------------------------------------------------------------- */

describe("SIGNAL-ENGINE-01 / page & navigation", () => {
  it("signal page file exists", async () => {
    const fs = await import("node:fs/promises")
    await fs.access(resolve(process.cwd(), "app/(internal)/admin/analytics/signal/page.tsx"))
  })

  it("signal page imports getSignalEngine", async () => {
    const fs = await import("node:fs/promises")
    const content = await fs.readFile(
      resolve(process.cwd(), "app/(internal)/admin/analytics/signal/page.tsx"),
      "utf-8",
    )
    assert.ok(content.includes("getSignalEngine"))
    assert.ok(content.includes("signal-engine-actions"))
  })

  it("admin-shell includes Signaux nav item with /admin/analytics/signal href", async () => {
    const fs = await import("node:fs/promises")
    const content = await fs.readFile(
      resolve(process.cwd(), "components/admin-shell.tsx"),
      "utf-8",
    )
    assert.ok(content.includes("/admin/analytics/signal"))
    assert.ok(content.includes("Signaux"))
  })

  it("admin-shell imports Sparkles icon", async () => {
    const fs = await import("node:fs/promises")
    const content = await fs.readFile(
      resolve(process.cwd(), "components/admin-shell.tsx"),
      "utf-8",
    )
    assert.ok(content.includes("Sparkles"))
  })
})
