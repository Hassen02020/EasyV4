/**
 * NETWORK-DEMAND-CAPTURE-01 — tests unitaires de resolveLeadOriginRoleCore,
 * fonction pure (aucun accès DB requis).
 *
 * Règle testée (fiche validée) : trust rank maximal → résolution ; même
 * rang + même actorRef → confirmation ; même rang + actorRef différent →
 * CONFLIT → null ; un rang inférieur ne peut jamais écraser un rang
 * supérieur ; aucun départage par date entre acteurs concurrents de même
 * rang ; pur, déterministe, idempotent, indépendant de l'ordre d'insertion.
 */
import test from "node:test"
import assert from "node:assert/strict"
import {
  resolveLeadOriginRoleCore,
  type LeadOriginEventRow,
} from "../network-demand-capture-core"

function event(over: Partial<LeadOriginEventRow> = {}): LeadOriginEventRow {
  return {
    id: "evt-1",
    leadId: "lead-1",
    role: "origin_agency",
    actorRef: "agency-a",
    source: "partner_portal_claim",
    notes: null,
    recordedAt: new Date("2026-10-01T00:00:00Z"),
    ...over,
  }
}

test("aucun événement pour le rôle → null", () => {
  assert.equal(resolveLeadOriginRoleCore([], "origin_agency"), null)
  assert.equal(
    resolveLeadOriginRoleCore([event({ role: "channel" })], "origin_agency"),
    null,
  )
})

test("un seul événement → il gagne", () => {
  const winner = resolveLeadOriginRoleCore([event()], "origin_agency")
  assert.equal(winner?.actorRef, "agency-a")
})

test("source fiable (rang élevé) puis source moins fiable arrivant après → la fiable reste gagnante", () => {
  const reliable = event({
    id: "evt-reliable",
    actorRef: "agency-trusted",
    source: "staff_manual_entry", // rang 2
    recordedAt: new Date("2026-10-01T00:00:00Z"),
  })
  const lateWeak = event({
    id: "evt-late-weak",
    actorRef: "agency-opportunist",
    source: "partner_portal_claim", // rang 0
    recordedAt: new Date("2026-12-01T00:00:00Z"), // bien plus tardif
  })
  const winner = resolveLeadOriginRoleCore(
    [reliable, lateWeak],
    "origin_agency",
  )
  assert.equal(
    winner?.actorRef,
    "agency-trusted",
    "un rang inférieur ne doit jamais écraser un rang supérieur, même plus récent",
  )
})

test("correction de rang supérieur (staff_correction) l'emporte sur tout historique antérieur", () => {
  const original = event({
    id: "evt-original",
    actorRef: "agency-a",
    source: "whatsapp_webhook", // rang 1
    recordedAt: new Date("2026-10-01T00:00:00Z"),
  })
  const correction = event({
    id: "evt-correction",
    actorRef: "agency-corrected",
    source: "staff_correction", // rang 3, le plus haut
    recordedAt: new Date("2026-10-02T00:00:00Z"),
  })
  const winner = resolveLeadOriginRoleCore(
    [original, correction],
    "origin_agency",
  )
  assert.equal(winner?.actorRef, "agency-corrected")
})

test("même rang + même actorRef (confirmation répétée) → résolu, pas un conflit", () => {
  const first = event({
    id: "evt-first",
    actorRef: "agency-a",
    source: "whatsapp_webhook",
    recordedAt: new Date("2026-10-01T00:00:00Z"),
  })
  const confirm = event({
    id: "evt-confirm",
    actorRef: "agency-a", // même acteur
    source: "whatsapp_webhook",
    recordedAt: new Date("2026-10-05T00:00:00Z"),
  })
  const winner = resolveLeadOriginRoleCore([first, confirm], "origin_agency")
  assert.equal(winner?.actorRef, "agency-a")
})

test("même rang + actorRef DIFFÉRENT → CONFLIT → null, jamais un départage par date", () => {
  const claimA = event({
    id: "evt-a",
    actorRef: "agency-a",
    source: "whatsapp_webhook",
    recordedAt: new Date("2026-10-01T00:00:00Z"),
  })
  const claimB = event({
    id: "evt-b",
    actorRef: "agency-b", // acteur concurrent, même rang
    source: "whatsapp_webhook",
    recordedAt: new Date("2026-10-05T00:00:00Z"), // plus récent — ne doit PAS gagner
  })
  const winner = resolveLeadOriginRoleCore([claimA, claimB], "origin_agency")
  assert.equal(
    winner,
    null,
    "deux acteurs concurrents de même rang doivent résoudre à null, jamais au plus récent",
  )
})

test("conflit non résolu par une 3e confirmation de rang INFÉRIEUR — le conflit au rang max persiste", () => {
  const claimA = event({
    id: "evt-a",
    actorRef: "agency-a",
    source: "staff_manual_entry", // rang 2
    recordedAt: new Date("2026-10-01T00:00:00Z"),
  })
  const claimB = event({
    id: "evt-b",
    actorRef: "agency-b",
    source: "staff_manual_entry", // rang 2, même rang que A → conflit
    recordedAt: new Date("2026-10-02T00:00:00Z"),
  })
  const weakVote = event({
    id: "evt-weak",
    actorRef: "agency-a",
    source: "partner_portal_claim", // rang 0, n'entre pas en jeu
    recordedAt: new Date("2026-10-10T00:00:00Z"),
  })
  const winner = resolveLeadOriginRoleCore(
    [claimA, claimB, weakVote],
    "origin_agency",
  )
  assert.equal(winner, null)
})

test("rôles indépendants — ne se mélangent jamais", () => {
  const events = [
    event({ role: "origin_agency", actorRef: "agency-a" }),
    event({ role: "captured_by_user", actorRef: "user-b" }),
    event({ role: "channel", actorRef: "whatsapp" }),
    event({ role: "campaign", actorRef: "facebook:ad123" }),
  ]
  assert.equal(
    resolveLeadOriginRoleCore(events, "origin_agency")?.actorRef,
    "agency-a",
  )
  assert.equal(
    resolveLeadOriginRoleCore(events, "captured_by_user")?.actorRef,
    "user-b",
  )
  assert.equal(
    resolveLeadOriginRoleCore(events, "channel")?.actorRef,
    "whatsapp",
  )
  assert.equal(
    resolveLeadOriginRoleCore(events, "campaign")?.actorRef,
    "facebook:ad123",
  )
})

test("source inconnue (absente de LEAD_ORIGIN_SOURCE_TRUST) traitée comme rang 0, jamais une exception", () => {
  const unknown = event({ source: "some_future_mechanism" })
  const winner = resolveLeadOriginRoleCore([unknown], "origin_agency")
  assert.equal(winner?.actorRef, "agency-a")
})

test("indépendant de l'ordre d'insertion — même résultat quel que soit l'ordre du tableau", () => {
  const reliable = event({
    id: "evt-reliable",
    actorRef: "agency-trusted",
    source: "staff_correction",
    recordedAt: new Date("2026-10-01T00:00:00Z"),
  })
  const weak1 = event({
    id: "evt-weak-1",
    actorRef: "agency-x",
    source: "partner_portal_claim",
    recordedAt: new Date("2026-09-01T00:00:00Z"),
  })
  const weak2 = event({
    id: "evt-weak-2",
    actorRef: "agency-y",
    source: "utm_capture",
    recordedAt: new Date("2026-11-01T00:00:00Z"),
  })
  const order1 = resolveLeadOriginRoleCore(
    [weak1, reliable, weak2],
    "origin_agency",
  )
  const order2 = resolveLeadOriginRoleCore(
    [weak2, weak1, reliable],
    "origin_agency",
  )
  const order3 = resolveLeadOriginRoleCore(
    [reliable, weak2, weak1],
    "origin_agency",
  )
  assert.equal(order1?.actorRef, "agency-trusted")
  assert.equal(order2?.actorRef, "agency-trusted")
  assert.equal(order3?.actorRef, "agency-trusted")
})

test("idempotence — rejouer la résolution sur le même jeu d'événements donne toujours le même résultat", () => {
  const events = [
    event({ id: "a", actorRef: "agency-a", source: "whatsapp_webhook" }),
    event({ id: "b", actorRef: "agency-b", source: "whatsapp_webhook" }),
  ]
  const r1 = resolveLeadOriginRoleCore(events, "origin_agency")
  const r2 = resolveLeadOriginRoleCore(events, "origin_agency")
  const r3 = resolveLeadOriginRoleCore([...events], "origin_agency")
  assert.equal(r1, r2)
  assert.deepEqual(r1, r3)
})
