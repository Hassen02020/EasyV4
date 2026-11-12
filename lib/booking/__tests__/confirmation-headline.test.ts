/**
 * CONFIRMATION-TITLE-TRUTH-01 — « Réservation confirmée » seulement pour un
 * statut réellement confirmé ; la page n'affiche plus de titre en dur.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { confirmationHeadline } from "../confirmation-headline"

test("confirmed / completed → titre « confirmée »", () => {
  for (const s of ["confirmed", "completed"]) {
    assert.deepEqual(confirmationHeadline(s), {
      kind: "confirmed",
      titleKey: "confirmedTitle",
    })
  }
})

test("pending / on_request → jamais « confirmée »", () => {
  for (const s of ["pending", "on_request"]) {
    const h = confirmationHeadline(s)
    assert.equal(h.kind, "pending")
    assert.notEqual(h.titleKey, "confirmedTitle")
  }
})

test("cancelled → titre « annulée »", () => {
  assert.equal(confirmationHeadline("cancelled").kind, "cancelled")
  assert.notEqual(confirmationHeadline("cancelled").titleKey, "confirmedTitle")
})

test("statut inconnu ou vide → repli neutre, jamais « confirmée »", () => {
  for (const s of ["", "refunded", "failed", "xyz"]) {
    const h = confirmationHeadline(s)
    assert.equal(h.kind, "neutral")
    assert.notEqual(h.titleKey, "confirmedTitle")
  }
})

test("la page utilise le titre dérivé du statut, plus de titre en dur", () => {
  const src = readFileSync(
    "app/(public)/[locale]/booking/confirmation/[ref]/page.tsx",
    "utf8",
  )
  assert.doesNotMatch(src, /t\("confirmedTitle"\)/)
  assert.match(src, /confirmationHeadline\(row\.status\)/)
  assert.doesNotMatch(src, /<CheckCircle2 className/)
})

test("les trois nouvelles clés existent en fr, en et ar", () => {
  for (const l of ["fr", "en", "ar"]) {
    const m = JSON.parse(readFileSync(`messages/${l}.json`, "utf8")).Booking
    for (const k of [
      "headlinePendingTitle",
      "headlineCancelledTitle",
      "headlineNeutralTitle",
    ])
      assert.ok(m[k] && m[k].length > 3, `${l}.${k}`)
  }
})
