/**
 * CAMPAIGN-DELIVERY-STATS-01 — tests comportementaux pour getCampaignPerformanceCore.
 *
 * Vérifie que les compteurs delivery (sent/failed/skipped/pending) et
 * l'invariant totalTargets = sent + failed + skipped + pending sont corrects.
 * Pas de dépendance réseau — tx entièrement mocké.
 *
 * Converti de vitest → node:test (TEST-COMPAT-01).
 */

import { describe, test } from "node:test"
import assert from "node:assert/strict"
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

  const chain: Record<string, unknown> = {}
  chain.from = () => chain
  chain.innerJoin = () => chain
  chain.where = () => {
    queryCount++
    if (queryCount === 1) {
      return Promise.resolve([{ count: total, sent, failed, skipped, pending }])
    }
    return Promise.resolve(attributedRows)
  }

  return {
    select: () => chain,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CAMPAIGN-DELIVERY-STATS-01 — getCampaignPerformanceCore delivery breakdown", () => {
  test("5 targets (2 sent, 1 failed, 1 skipped, 1 pending) → compteurs corrects", async () => {
    const tx = makeTx({ sent: 2, failed: 1, skipped: 1, pending: 1 })
    const result = await getCampaignPerformanceCore(tx as never, {
      agencyId: "agency-1",
      campaignId: "camp-1",
    })

    assert.strictEqual(result.sent, 2)
    assert.strictEqual(result.failed, 1)
    assert.strictEqual(result.skipped, 1)
    assert.strictEqual(result.pending, 1)
    assert.strictEqual(result.totalTargets, 5)
    assert.strictEqual(result.exposed, 5)
  })

  test("invariant totalTargets = sent + failed + skipped + pending", async () => {
    const tx = makeTx({ sent: 3, failed: 2, skipped: 4, pending: 1 })
    const result = await getCampaignPerformanceCore(tx as never, {
      agencyId: "agency-1",
      campaignId: "camp-2",
    })

    assert.strictEqual(
      result.totalTargets,
      result.sent + result.failed + result.skipped + result.pending,
    )
  })

  test("aucune target → tous les compteurs = 0", async () => {
    const tx = makeTx({})
    const result = await getCampaignPerformanceCore(tx as never, {
      agencyId: "agency-1",
      campaignId: "camp-empty",
    })

    assert.strictEqual(result.sent, 0)
    assert.strictEqual(result.failed, 0)
    assert.strictEqual(result.skipped, 0)
    assert.strictEqual(result.pending, 0)
    assert.strictEqual(result.totalTargets, 0)
    assert.strictEqual(result.exposed, 0)
    assert.strictEqual(result.converted, 0)
  })

  test("toutes les targets sent → pending/failed/skipped = 0", async () => {
    const tx = makeTx({ sent: 10 })
    const result = await getCampaignPerformanceCore(tx as never, {
      agencyId: "agency-1",
      campaignId: "camp-all-sent",
    })

    assert.strictEqual(result.sent, 10)
    assert.strictEqual(result.failed, 0)
    assert.strictEqual(result.skipped, 0)
    assert.strictEqual(result.pending, 0)
    assert.strictEqual(result.totalTargets, 10)
  })
})
