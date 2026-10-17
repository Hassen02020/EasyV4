/**
 * INNGEST-HANDLER-WIRING-03/activities — invariants statiques sur le câblage
 * du sendEvent de confirmation pour les réservations Attraction (Activity) B2C.
 *
 * Invariants protégés :
 *
 * 1. sendEvent "booking/activity.confirmed" câblé et conditionné sur
 *    result.status === "confirmed" && email disponible.
 * 2. payload complet : publicRef, agencyId, activityTitle, paxCount,
 *    totalTnd, contactEmail.
 * 3. .catch() présent — échec Inngest ne doit JAMAIS annuler la réservation.
 * 4. activityTitle et totalTnd transitent depuis le retour de transaction
 *    (résolution serveur, jamais fournie par le client).
 *
 * Pattern readFileSync : "use server" empêche l'import direct sous node --test.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const src = readFileSync(
  join(ROOT, "lib/activities/guest-booking-actions.ts"),
  "utf8",
)

// ─── 1. sendEvent câblé ───────────────────────────────────────────────────
test("ACTIVITY-WIRING-01 : sendEvent importé depuis @/lib/inngest/client", () => {
  assert.match(src, /import.*sendEvent.*from.*@\/lib\/inngest\/client/)
})

test("ACTIVITY-WIRING-02 : sendEvent booking/activity.confirmed câblé", () => {
  assert.match(src, /sendEvent\("booking\/activity\.confirmed"/)
})

test("ACTIVITY-WIRING-03 : sendEvent déclenché si status confirmed et email", () => {
  assert.match(
    src,
    /result\.status\s*===\s*["']confirmed["'].*traveler\.email/s,
    "guard status confirmed + email requis avant sendEvent",
  )
})

// ─── 2. .catch() présent ─────────────────────────────────────────────────
test("ACTIVITY-WIRING-04 : sendEvent protégé par .catch() (réservation non annulée si Inngest indisponible)", () => {
  assert.match(
    src,
    /sendEvent\("booking\/activity\.confirmed"[\s\S]*?\)\.catch\(/,
  )
})

// ─── 3. payload complet ───────────────────────────────────────────────────
test("ACTIVITY-WIRING-05 : payload contient publicRef depuis result", () => {
  assert.match(src, /publicRef:\s*result\.publicRef/)
})

test("ACTIVITY-WIRING-06 : payload contient agencyId", () => {
  assert.match(src, /agencyId,/)
})

test("ACTIVITY-WIRING-07 : payload contient activityTitle depuis result (résolution serveur)", () => {
  assert.match(src, /activityTitle:\s*result\.activityTitle/)
})

test("ACTIVITY-WIRING-08 : payload contient paxCount", () => {
  assert.match(src, /paxCount,/)
})

test("ACTIVITY-WIRING-09 : payload contient totalTnd depuis result", () => {
  assert.match(src, /totalTnd:\s*result\.totalTnd/)
})

test("ACTIVITY-WIRING-10 : payload contient contactEmail depuis traveler.email", () => {
  assert.match(src, /contactEmail:\s*traveler\.email/)
})

// ─── 4. champ exposé depuis la transaction ────────────────────────────────
test("ACTIVITY-WIRING-11 : activityTitle retourné depuis la transaction (activity.title)", () => {
  assert.match(src, /activityTitle:\s*activity\.title/)
})
