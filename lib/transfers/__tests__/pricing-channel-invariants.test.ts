/**
 * BUG-TRANSFER-02 — canal de distribution explicite dans calculateTransferPrice
 *
 * Invariants statiques (readFileSync, pattern établi du repo) :
 *   - lib/transfers/actions.ts (B2B) : passe explicitement channel:"b2b"
 *   - lib/transfers/guest-booking-actions.ts (B2C) : passe explicitement
 *     channel:"direct" — jamais implicite (??fallback) qui masquerait une
 *     confusion future sur le canal réel appliqué aux marges.
 *
 * Valeurs valides de DistributionChannel : "direct"|"b2b"|"white_label"|"api"
 * (lib/types/tenant.ts). "direct" = vente directe au consommateur, correct
 * pour le chemin guest.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const b2bSrc = readFileSync(join(ROOT, "lib/transfers/actions.ts"), "utf8")
const guestSrc = readFileSync(
  join(ROOT, "lib/transfers/guest-booking-actions.ts"),
  "utf8",
)

/* -------------------------------------------------------------------------- */
/* B2B — channel:"b2b" explicite                                              */
/* -------------------------------------------------------------------------- */

test("transfers/actions.ts : calculateTransferPrice reçoit channel:\"b2b\" explicitement", () => {
  assert.match(b2bSrc, /channel:\s*["']b2b["']/)
})

/* -------------------------------------------------------------------------- */
/* B2C guest — channel:"direct" explicite                                     */
/* -------------------------------------------------------------------------- */

test("transfers/guest-booking-actions.ts : calculateTransferPrice reçoit channel:\"direct\" explicitement", () => {
  assert.match(guestSrc, /channel:\s*["']direct["']/)
})

test("transfers/guest-booking-actions.ts : aucun channel:\"b2b\" dans le chemin guest", () => {
  // Le guest path ne doit JAMAIS appliquer les marges B2B partenaires.
  assert.doesNotMatch(guestSrc, /channel:\s*["']b2b["']/)
})
