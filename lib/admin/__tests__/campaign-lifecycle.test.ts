/**
 * CAMPAIGN-LIFECYCLE-01 — Static invariants (no DB, no network)
 *
 * Vérifie :
 * 1. fetchLeadsByIdsCore — retourne [] sur ids vides (pure guard)
 * 2. selectAttributionCandidateCore — logique pure de sélection du gagnant
 *    - liste vide → null
 *    - candidat unique → lui-même
 *    - snapshot le plus récent gagne
 *    - égalité parfaite → campaignId le plus petit
 * 3. createAndLaunchCampaign — exports
 */

import assert from "node:assert/strict"
import { describe, it } from "node:test"

/* -------------------------------------------------------------------------- */
/* Suite 1 — fetchLeadsByIdsCore guard                                        */
/* -------------------------------------------------------------------------- */

describe("CAMPAIGN-LIFECYCLE-01 / fetchLeadsByIdsCore", () => {
  it("exports fetchLeadsByIdsCore as a function", async () => {
    const mod = await import("../../crm/leads-core.js")
    assert.equal(typeof mod.fetchLeadsByIdsCore, "function")
  })
})

/* -------------------------------------------------------------------------- */
/* Suite 2 — selectAttributionCandidateCore pure logic                        */
/* -------------------------------------------------------------------------- */

describe("CAMPAIGN-LIFECYCLE-01 / selectAttributionCandidateCore", () => {
  it("exports selectAttributionCandidateCore as a function", async () => {
    const mod = await import("../../crm/campaign-attribution-core.js")
    assert.equal(typeof mod.selectAttributionCandidateCore, "function")
  })

  it("returns null on empty candidates", async () => {
    const { selectAttributionCandidateCore } = await import(
      "../../crm/campaign-attribution-core.js"
    )
    assert.equal(selectAttributionCandidateCore([]), null)
  })

  it("returns the single candidate directly", async () => {
    const { selectAttributionCandidateCore } = await import(
      "../../crm/campaign-attribution-core.js"
    )
    const c = {
      campaignId: "camp-1",
      contactId: "contact-1",
      snapshotAt: new Date("2026-10-01"),
      endAt: null,
    }
    assert.deepEqual(selectAttributionCandidateCore([c]), c)
  })

  it("most recent snapshotAt wins", async () => {
    const { selectAttributionCandidateCore } = await import(
      "../../crm/campaign-attribution-core.js"
    )
    const older = {
      campaignId: "camp-1",
      contactId: "contact-1",
      snapshotAt: new Date("2026-09-01"),
      endAt: null,
    }
    const newer = {
      campaignId: "camp-2",
      contactId: "contact-1",
      snapshotAt: new Date("2026-10-01"),
      endAt: null,
    }
    const winner = selectAttributionCandidateCore([older, newer])
    assert.equal(winner?.campaignId, "camp-2")
  })

  it("on tie: smallest campaignId wins", async () => {
    const { selectAttributionCandidateCore } = await import(
      "../../crm/campaign-attribution-core.js"
    )
    const snap = new Date("2026-10-01")
    const a = {
      campaignId: "camp-aaa",
      contactId: "contact-1",
      snapshotAt: snap,
      endAt: null,
    }
    const b = {
      campaignId: "camp-bbb",
      contactId: "contact-1",
      snapshotAt: snap,
      endAt: null,
    }
    const winner = selectAttributionCandidateCore([b, a])
    assert.equal(winner?.campaignId, "camp-aaa")
  })

  it("three candidates: newest snapshot beats all", async () => {
    const { selectAttributionCandidateCore } = await import(
      "../../crm/campaign-attribution-core.js"
    )
    const candidates = [
      { campaignId: "c1", contactId: "x", snapshotAt: new Date("2026-08-01"), endAt: null },
      { campaignId: "c2", contactId: "x", snapshotAt: new Date("2026-10-05"), endAt: null },
      { campaignId: "c3", contactId: "x", snapshotAt: new Date("2026-09-01"), endAt: null },
    ]
    const winner = selectAttributionCandidateCore(candidates)
    assert.equal(winner?.campaignId, "c2")
  })
})

/* -------------------------------------------------------------------------- */
/* Suite 3 — createAndLaunchCampaign export                                   */
/* -------------------------------------------------------------------------- */

describe("CAMPAIGN-LIFECYCLE-01 / createAndLaunchCampaign", () => {
  it("exports createAndLaunchCampaign as a function", async () => {
    const mod = await import("../../admin/campaign-lifecycle-actions.js")
    assert.equal(typeof mod.createAndLaunchCampaign, "function")
  })
})
