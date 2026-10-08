/**
 * CAMPAIGN-DELIVERY-STATS-01 — tests comportementaux pour getCampaignPerformanceCore.
 *
 * Vérifie que les compteurs delivery (sent/failed/skipped/pending) et
 * l'invariant totalTargets = sent + failed + skipped + pending sont corrects.
 * Pas de dépendance réseau — tx entièrement mocké.
 */

import { describe, it, expect, vi } from "vitest"
import { getCampaignPerformanceCore } from "../campaign-performance-core"

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/**
 * Construit un tx mock pour getCampaignPerformanceCore.
 *
 * Séquence des SELECT dans getCampaignPerformanceCore :
 *   1 → campaign_targets (COUNT + delivery status breakdown) — terminal: .where()
 *   2 → campaign_attributions ⋈ reservation_financials — terminal: .innerJoin().where()
 *
 * Comme `from()` retourne `this`, `innerJoin` et `where` doivent être sur le
 * même objet que `from`.
 */
function makeTx(opts: {
  sent?: number
  failed?: number
  skipped?: number
  pending?: number
  attributedRows?: { salePriceTnd: string; marginAmount: string }[]
}) {
  const {
    sent = 0,
    failed = 0,
    skipped = 0,
    pending = 0,
    attributedRows = [],
  } = opts

  const total = sent + failed + skipped + pending
  let queryCount = 0

  // Un seul objet chain partagé (from → this, innerJoin → this)
  const chain: Record<string, ReturnType<typeof vi.fn>> = {} as never
  chain.from = vi.fn(() => chain)
  chain.innerJoin = vi.fn(() => chain)
  chain.where = vi.fn(() => {
    queryCount++
    if (queryCount === 1) {
      // campaign_targets aggregation
      return Promise.resolve([{ count: total, sent, failed, skipped, pending }])
    }
    // campaign_attributions ⋈ reservation_financials
    return Promise.resolve(attributedRows)
  })

  return {
    select: vi.fn(() => chain),
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CAMPAIGN-DELIVERY-STATS-01 — getCampaignPerformanceCore delivery breakdown", () => {
  it("5 targets (2 sent, 1 failed, 1 skipped, 1 pending) → compteurs corrects", async () => {
    const tx = makeTx({ sent: 2, failed: 1, skipped: 1, pending: 1 })
    const result = await getCampaignPerformanceCore(tx as never, {
      agencyId: "agency-1",
      campaignId: "camp-1",
    })

    expect(result.sent).toBe(2)
    expect(result.failed).toBe(1)
    expect(result.skipped).toBe(1)
    expect(result.pending).toBe(1)
    expect(result.totalTargets).toBe(5)
    expect(result.exposed).toBe(5)
  })

  it("invariant totalTargets = sent + failed + skipped + pending", async () => {
    const tx = makeTx({ sent: 3, failed: 2, skipped: 4, pending: 1 })
    const result = await getCampaignPerformanceCore(tx as never, {
      agencyId: "agency-1",
      campaignId: "camp-2",
    })

    expect(result.totalTargets).toBe(
      result.sent + result.failed + result.skipped + result.pending,
    )
  })

  it("aucune target → tous les compteurs = 0", async () => {
    const tx = makeTx({})
    const result = await getCampaignPerformanceCore(tx as never, {
      agencyId: "agency-1",
      campaignId: "camp-empty",
    })

    expect(result.sent).toBe(0)
    expect(result.failed).toBe(0)
    expect(result.skipped).toBe(0)
    expect(result.pending).toBe(0)
    expect(result.totalTargets).toBe(0)
    expect(result.exposed).toBe(0)
    expect(result.converted).toBe(0)
  })

  it("toutes les targets sent → pending/failed/skipped = 0", async () => {
    const tx = makeTx({ sent: 10 })
    const result = await getCampaignPerformanceCore(tx as never, {
      agencyId: "agency-1",
      campaignId: "camp-all-sent",
    })

    expect(result.sent).toBe(10)
    expect(result.failed).toBe(0)
    expect(result.skipped).toBe(0)
    expect(result.pending).toBe(0)
    expect(result.totalTargets).toBe(10)
  })
})
