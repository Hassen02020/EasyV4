/**
 * CAMPAIGN-ATTRIBUTION-01 — tests unitaires de
 * selectAttributionCandidateCore (fonction pure, aucun accès DB requis).
 */
import test from "node:test"
import assert from "node:assert/strict"
import {
  selectAttributionCandidateCore,
  type AttributionCandidate,
} from "../campaign-attribution-core"

function candidate(over: Partial<AttributionCandidate>): AttributionCandidate {
  return {
    campaignId: "campaign-a",
    contactId: "contact-1",
    snapshotAt: new Date("2026-11-01T00:00:00Z"),
    endAt: null,
    ...over,
  }
}

test("aucun candidat → null", () => {
  assert.equal(selectAttributionCandidateCore([]), null)
})

test("un seul candidat → lui-même", () => {
  const c = candidate({})
  assert.deepEqual(selectAttributionCandidateCore([c]), c)
})

test("2 candidats, snapshots différents → le plus RÉCENT gagne", () => {
  const older = candidate({
    campaignId: "campaign-old",
    snapshotAt: new Date("2026-11-01T00:00:00Z"),
  })
  const newer = candidate({
    campaignId: "campaign-new",
    snapshotAt: new Date("2026-11-10T00:00:00Z"),
  })
  assert.deepEqual(selectAttributionCandidateCore([older, newer]), newer)
  // Ordre d'insertion différent → résultat identique.
  assert.deepEqual(selectAttributionCandidateCore([newer, older]), newer)
})

test("égalité parfaite de snapshotAt → campaignId le plus petit gagne (tie-breaker stable)", () => {
  const sameInstant = new Date("2026-11-05T00:00:00Z")
  const b = candidate({ campaignId: "campaign-b", snapshotAt: sameInstant })
  const a = candidate({ campaignId: "campaign-a", snapshotAt: sameInstant })
  assert.deepEqual(selectAttributionCandidateCore([b, a]), a)
  assert.deepEqual(selectAttributionCandidateCore([a, b]), a)
})

test("3 candidats → le plus récent gagne, indépendamment de endAt (déjà filtré par l'appelant)", () => {
  const c1 = candidate({
    campaignId: "campaign-1",
    snapshotAt: new Date("2026-11-01T00:00:00Z"),
  })
  const c2 = candidate({
    campaignId: "campaign-2",
    snapshotAt: new Date("2026-11-15T00:00:00Z"),
  })
  const c3 = candidate({
    campaignId: "campaign-3",
    snapshotAt: new Date("2026-11-10T00:00:00Z"),
  })
  assert.deepEqual(selectAttributionCandidateCore([c1, c2, c3]), c2)
})
