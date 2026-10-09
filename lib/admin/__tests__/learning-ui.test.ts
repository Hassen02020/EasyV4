/**
 * LEARNING-01 — Static invariants (no DB, no network)
 *
 * Vérifie :
 * 1. Exports du core
 * 2. Logique pure buildLearningCore
 *    - stats sur liste vide
 *    - comptage total / converti / taux
 *    - segmentation par bucket VIP
 *    - breakdown destinations
 *    - breakdown produits
 *    - avgDaysToConvert
 *    - topConverted trié par vipScore desc
 * 3. Exports de l'action
 * 4. Page & navigation
 */

import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { resolve } from "node:path"
import type { LeadWithScore } from "../../crm/learning-core.js"

function mkLead(
  id: string,
  vipScore: number,
  status: string,
  productType = "hotel",
  destination: string | null = "Tunis",
  daysAgo = 10,
  daysToConvert: number | null = null,
): LeadWithScore {
  const createdAt = new Date(Date.now() - daysAgo * 86_400_000)
  const convertedAt =
    daysToConvert !== null
      ? new Date(createdAt.getTime() + daysToConvert * 86_400_000)
      : null
  return {
    id,
    firstName: `Lead${id}`,
    lastName: null,
    vipScore,
    status,
    productType,
    destination,
    createdAt,
    convertedAt,
  }
}

/* -------------------------------------------------------------------------- */
/* Suite 1 — learning-core exports                                             */
/* -------------------------------------------------------------------------- */

describe("LEARNING-01 / learning-core", () => {
  it("exports buildLearningCore as a function", async () => {
    const mod = await import("../../crm/learning-core.js")
    assert.equal(typeof mod.buildLearningCore, "function")
  })

  it("exports VIP_BUCKET_LABELS", async () => {
    const mod = await import("../../crm/learning-core.js")
    assert.ok(typeof mod.VIP_BUCKET_LABELS === "object")
    assert.ok("vip_pp" in mod.VIP_BUCKET_LABELS)
  })

  /* ── Empty input ───────────────────────────────────────────────── */

  it("returns zeroed stats on empty input", async () => {
    const { buildLearningCore } = await import("../../crm/learning-core.js")
    const stats = buildLearningCore([], 4)
    assert.equal(stats.totalLeads, 0)
    assert.equal(stats.convertedLeads, 0)
    assert.equal(stats.overallRate, 0)
    assert.equal(stats.avgDaysToConvert, null)
    assert.deepEqual(stats.topConverted, [])
  })

  /* ── Totaux ────────────────────────────────────────────────────── */

  it("counts totalLeads and convertedLeads correctly", async () => {
    const { buildLearningCore } = await import("../../crm/learning-core.js")
    const leads = [
      mkLead("1", 90, "converted", "hotel", "Tunis", 5, 2),
      mkLead("2", 70, "new"),
      mkLead("3", 50, "contacted"),
      mkLead("4", 30, "converted", "omra", null, 7, 4),
    ]
    const stats = buildLearningCore(leads, 4)
    assert.equal(stats.totalLeads, 4)
    assert.equal(stats.convertedLeads, 2)
    assert.equal(stats.overallRate, 50)
  })

  it("overallRate rounds correctly", async () => {
    const { buildLearningCore } = await import("../../crm/learning-core.js")
    const leads = [
      mkLead("1", 90, "converted", "hotel", "Tunis", 5, 2),
      mkLead("2", 70, "new"),
      mkLead("3", 50, "new"),
    ]
    const stats = buildLearningCore(leads, 4)
    assert.equal(stats.totalLeads, 3)
    assert.equal(stats.convertedLeads, 1)
    assert.equal(stats.overallRate, 33)
  })

  /* ── Buckets ───────────────────────────────────────────────────── */

  it("returns 4 buckets always", async () => {
    const { buildLearningCore } = await import("../../crm/learning-core.js")
    const stats = buildLearningCore([mkLead("1", 90, "new")], 4)
    assert.equal(stats.byBucket.length, 4)
  })

  it("vipScore >= 80 → bucket vip_pp", async () => {
    const { buildLearningCore } = await import("../../crm/learning-core.js")
    const stats = buildLearningCore(
      [
        mkLead("1", 80, "converted", "hotel", "Tunis", 5, 2),
        mkLead("2", 90, "new"),
      ],
      4,
    )
    const bucket = stats.byBucket.find((b) => b.bucket === "vip_pp")!
    assert.equal(bucket.total, 2)
    assert.equal(bucket.converted, 1)
    assert.equal(bucket.rate, 50)
  })

  it("vipScore 50-79 → bucket vip_p", async () => {
    const { buildLearningCore } = await import("../../crm/learning-core.js")
    const stats = buildLearningCore(
      [mkLead("1", 65, "converted", "hotel", "Tunis", 5, 2)],
      4,
    )
    const bucket = stats.byBucket.find((b) => b.bucket === "vip_p")!
    assert.equal(bucket.total, 1)
    assert.equal(bucket.converted, 1)
    assert.equal(bucket.rate, 100)
  })

  it("vipScore 25-49 → bucket pipeline", async () => {
    const { buildLearningCore } = await import("../../crm/learning-core.js")
    const stats = buildLearningCore([mkLead("1", 30, "new")], 4)
    const bucket = stats.byBucket.find((b) => b.bucket === "pipeline")!
    assert.equal(bucket.total, 1)
    assert.equal(bucket.converted, 0)
  })

  it("vipScore < 25 → bucket faible", async () => {
    const { buildLearningCore } = await import("../../crm/learning-core.js")
    const stats = buildLearningCore([mkLead("1", 10, "new")], 4)
    const bucket = stats.byBucket.find((b) => b.bucket === "faible")!
    assert.equal(bucket.total, 1)
  })

  /* ── Destinations ──────────────────────────────────────────────── */

  it("groups by destination with correct conversion rates", async () => {
    const { buildLearningCore } = await import("../../crm/learning-core.js")
    const leads = [
      mkLead("1", 90, "converted", "hotel", "Tunis", 5, 2),
      mkLead("2", 70, "new", "hotel", "Tunis"),
      mkLead("3", 60, "converted", "hotel", "Marrakech", 5, 3),
    ]
    const stats = buildLearningCore(leads, 4)
    const tunis = stats.byDestination.find((d) => d.dimension === "Tunis")!
    assert.equal(tunis.total, 2)
    assert.equal(tunis.converted, 1)
    assert.equal(tunis.rate, 50)
    const marrakech = stats.byDestination.find(
      (d) => d.dimension === "Marrakech",
    )!
    assert.equal(marrakech.total, 1)
    assert.equal(marrakech.converted, 1)
    assert.equal(marrakech.rate, 100)
  })

  it("leads with null destination are excluded from byDestination", async () => {
    const { buildLearningCore } = await import("../../crm/learning-core.js")
    const leads = [mkLead("1", 60, "converted", "omra", null, 5, 2)]
    const stats = buildLearningCore(leads, 4)
    assert.equal(stats.byDestination.length, 0)
  })

  /* ── Produits ──────────────────────────────────────────────────── */

  it("groups by productType", async () => {
    const { buildLearningCore } = await import("../../crm/learning-core.js")
    const leads = [
      mkLead("1", 90, "converted", "hotel", "Tunis", 5, 2),
      mkLead("2", 70, "new", "omra", null),
      mkLead("3", 60, "converted", "omra", null, 5, 3),
    ]
    const stats = buildLearningCore(leads, 4)
    const hotelStats = stats.byProduct.find((p) => p.dimension === "hotel")!
    assert.equal(hotelStats.total, 1)
    assert.equal(hotelStats.converted, 1)
    const omraStats = stats.byProduct.find((p) => p.dimension === "omra")!
    assert.equal(omraStats.total, 2)
    assert.equal(omraStats.converted, 1)
  })

  /* ── avgDaysToConvert ──────────────────────────────────────────── */

  it("avgDaysToConvert is null when no conversions", async () => {
    const { buildLearningCore } = await import("../../crm/learning-core.js")
    const stats = buildLearningCore([mkLead("1", 90, "new")], 4)
    assert.equal(stats.avgDaysToConvert, null)
  })

  it("avgDaysToConvert averages correctly", async () => {
    const { buildLearningCore } = await import("../../crm/learning-core.js")
    const leads = [
      mkLead("1", 90, "converted", "hotel", "Tunis", 10, 2),
      mkLead("2", 80, "converted", "hotel", "Tunis", 10, 4),
    ]
    const stats = buildLearningCore(leads, 4)
    assert.equal(stats.avgDaysToConvert, 3)
  })

  /* ── topConverted ──────────────────────────────────────────────── */

  it("topConverted sorted by vipScore desc", async () => {
    const { buildLearningCore } = await import("../../crm/learning-core.js")
    const leads = [
      mkLead("1", 70, "converted", "hotel", "Tunis", 5, 2),
      mkLead("2", 90, "converted", "omra", null, 5, 3),
    ]
    const stats = buildLearningCore(leads, 4)
    assert.equal(stats.topConverted[0].id, "2")
    assert.equal(stats.topConverted[1].id, "1")
  })

  it("topConverted includes daysToConvert", async () => {
    const { buildLearningCore } = await import("../../crm/learning-core.js")
    const leads = [mkLead("1", 90, "converted", "hotel", "Tunis", 10, 5)]
    const stats = buildLearningCore(leads, 4)
    assert.equal(stats.topConverted[0].daysToConvert, 5)
  })

  it("topConverted capped at 20", async () => {
    const { buildLearningCore } = await import("../../crm/learning-core.js")
    const leads = Array.from({ length: 25 }, (_, i) =>
      mkLead(String(i), 90, "converted", "hotel", "Tunis", 5, 2),
    )
    const stats = buildLearningCore(leads, 4)
    assert.ok(stats.topConverted.length <= 20)
  })

  /* ── windowWeeks ────────────────────────────────────────────────── */

  it("windowWeeks is preserved in output", async () => {
    const { buildLearningCore } = await import("../../crm/learning-core.js")
    const stats = buildLearningCore([], 8)
    assert.equal(stats.windowWeeks, 8)
  })
})

/* -------------------------------------------------------------------------- */
/* Suite 2 — learning-actions exports                                         */
/* -------------------------------------------------------------------------- */

describe("LEARNING-01 / learning-actions", () => {
  it("exports getLearning as a function", async () => {
    const mod = await import("../../admin/learning-actions.js")
    assert.equal(typeof mod.getLearning, "function")
  })
})

/* -------------------------------------------------------------------------- */
/* Suite 3 — page & navigation                                                */
/* -------------------------------------------------------------------------- */

describe("LEARNING-01 / page & navigation", () => {
  it("learning page file exists", async () => {
    const fs = await import("node:fs/promises")
    await fs.access(
      resolve(
        process.cwd(),
        "app/(internal)/admin/analytics/learning/page.tsx",
      ),
    )
  })

  it("learning page imports getLearning", async () => {
    const fs = await import("node:fs/promises")
    const content = await fs.readFile(
      resolve(
        process.cwd(),
        "app/(internal)/admin/analytics/learning/page.tsx",
      ),
      "utf-8",
    )
    assert.ok(content.includes("getLearning"))
    assert.ok(content.includes("learning-actions"))
  })

  it("learning page renders byBucket and topConverted", async () => {
    const fs = await import("node:fs/promises")
    const content = await fs.readFile(
      resolve(
        process.cwd(),
        "app/(internal)/admin/analytics/learning/page.tsx",
      ),
      "utf-8",
    )
    assert.ok(content.includes("byBucket"))
    assert.ok(content.includes("topConverted"))
  })

  it("admin-shell includes Apprentissage nav item with /admin/analytics/learning href", async () => {
    const fs = await import("node:fs/promises")
    const content = await fs.readFile(
      resolve(process.cwd(), "components/admin-shell.tsx"),
      "utf-8",
    )
    assert.ok(content.includes("/admin/analytics/learning"))
    assert.ok(content.includes("Apprentissage"))
  })

  it("admin-shell imports BookCheck icon", async () => {
    const fs = await import("node:fs/promises")
    const content = await fs.readFile(
      resolve(process.cwd(), "components/admin-shell.tsx"),
      "utf-8",
    )
    assert.ok(content.includes("BookCheck"))
  })
})
