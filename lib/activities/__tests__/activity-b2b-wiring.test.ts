/**
 * INNGEST-HANDLER-WIRING-03/activities-b2b — invariants statiques sur le
 * câblage du sendEvent de confirmation pour les réservations Attraction B2B.
 *
 * Invariants protégés :
 *
 * 1. sendEvent "booking/activity.confirmed" importé et câblé.
 * 2. Guard customerEmail présent (champ optionnel en B2B).
 * 3. .catch() présent — échec Inngest ne doit JAMAIS annuler la réservation.
 * 4. activityTitle et totalTnd transitent depuis le retour de transaction
 *    (résolution serveur, jamais fournis par le client).
 * 5. payload complet : publicRef, agencyId, paxCount, contactEmail.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const src = readFileSync(
  join(ROOT, "lib/activities/booking-actions.ts"),
  "utf8",
)

// ─── 1. sendEvent câblé ───────────────────────────────────────────────────
test("ACTIVITY-B2B-WIRING-01 : sendEvent importé depuis @/lib/inngest/client", () => {
  assert.match(src, /import.*sendEvent.*from.*@\/lib\/inngest\/client/)
})

test("ACTIVITY-B2B-WIRING-02 : sendEvent booking/activity.confirmed câblé", () => {
  assert.match(src, /sendEvent\("booking\/activity\.confirmed"/)
})

// ─── 2. Guard email ───────────────────────────────────────────────────────
test("ACTIVITY-B2B-WIRING-03 : sendEvent conditionné sur booking.customerEmail", () => {
  assert.match(
    src,
    /booking\.customerEmail[\s\S]*?sendEvent\("booking\/activity\.confirmed"/,
    "guard customerEmail requis avant sendEvent",
  )
})

// ─── 3. .catch() présent ─────────────────────────────────────────────────
test("ACTIVITY-B2B-WIRING-04 : sendEvent protégé par .catch() (réservation non annulée si Inngest indisponible)", () => {
  assert.match(
    src,
    /sendEvent\("booking\/activity\.confirmed"[\s\S]*?\)\.catch\(/,
  )
})

// ─── 4. payload complet ───────────────────────────────────────────────────
test("ACTIVITY-B2B-WIRING-05 : payload contient publicRef depuis result", () => {
  assert.match(src, /publicRef:\s*result\.publicRef/)
})

test("ACTIVITY-B2B-WIRING-06 : payload contient agencyId", () => {
  assert.match(src, /agencyId,/)
})

test("ACTIVITY-B2B-WIRING-07 : payload contient activityTitle depuis result (résolution serveur)", () => {
  assert.match(src, /activityTitle:\s*result\.activityTitle/)
})

test("ACTIVITY-B2B-WIRING-08 : payload contient paxCount", () => {
  assert.match(src, /paxCount,/)
})

test("ACTIVITY-B2B-WIRING-09 : payload contient totalTnd depuis result", () => {
  assert.match(src, /totalTnd:\s*result\.totalTnd/)
})

test("ACTIVITY-B2B-WIRING-10 : payload contient contactEmail depuis booking.customerEmail", () => {
  assert.match(src, /contactEmail:\s*booking\.customerEmail/)
})

// ─── 5. champ exposé depuis la transaction ────────────────────────────────
test("ACTIVITY-B2B-WIRING-11 : activityTitle retourné depuis la transaction (activity.title)", () => {
  assert.match(src, /activityTitle:\s*activity\.title/)
})

test("ACTIVITY-B2B-WIRING-12 : totalTnd retourné depuis la transaction", () => {
  assert.match(src, /return\s*\{[\s\S]*?totalTnd[\s\S]*?\}/)
})
