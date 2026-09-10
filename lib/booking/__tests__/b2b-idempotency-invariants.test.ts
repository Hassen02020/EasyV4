/**
 * MASTER PROMPT (production hardening audit) — `createReservationFromDraft`
 * (chemin de réservation B2B, `lib/booking/actions.ts`) n'avait AUCUNE
 * protection contre un double-submit/retry réseau, contrairement au chemin
 * guest checkout (Phase 20, `guest-actions.ts::withGuestIdempotency` +
 * backstop DB). Concrètement : un double-clic sur "Confirmer" pouvait créer
 * DEUX réservations, DEUX réservations myGo réelles ET DEUX débits wallet
 * pour une seule intention de réservation — surtout probable si Redis/
 * Upstash est absent de l'environnement (le seul garde alors en place,
 * `debitPartnerCredit`, est documenté comme silencieusement inactif sans
 * Redis).
 *
 * Corrigé en réutilisant EXACTEMENT le mécanisme déjà prouvé du guest
 * checkout (même colonne `guestIdempotencyKey`, même index unique
 * `reservations_guest_idempotency_uniq`, même schéma "sous-transaction +
 * catch 23505 + relecture du gagnant") plutôt que d'inventer un second
 * mécanisme — voir lib/booking/actions.ts.
 *
 * `actions.ts` importe transitivement `"server-only"` (via
 * lib/pro/server-context.ts) — comme documenté dans
 * tenant-continuity-invariants.test.ts, un test comportemental direct
 * (mock DB + appel réel de createReservationFromDraft) n'est pas possible
 * ici hors bundler Next.js. Vérification statique sur le code source réel,
 * même méthode que ce fichier voisin.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const actionsSrc = readFileSync(join(process.cwd(), "lib/booking/actions.ts"), "utf8")

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

test("createReservationFromDraft : accepte un idempotencyKey (optionnel — dérivé automatiquement si omis)", () => {
  assert.match(actionsSrc, /idempotencyKey\?: string/)
})

test("createReservationFromDraft : dérive une clé déterministe (sha256 de draft+traveler validés) quand l'appelant n'en fournit pas", () => {
  assert.match(
    actionsSrc,
    /const idempotencyKey =\s*\n\s*input\.idempotencyKey \?\?\s*\n\s*createHash\("sha256"\)\.update\(JSON\.stringify\(\{ draft, traveler \}\)\)\.digest\("hex"\)/,
  )
})

test("createReservationFromDraft : vérifie le backstop DB (findReservationByCheckoutIdempotencyKey) AVANT tout appel fournisseur myGo — jamais un second hold pour la même soumission", () => {
  const backstopIdx = actionsSrc.indexOf("findReservationByCheckoutIdempotencyKey(agencyId, idempotencyKey)")
  const providerCallIdx = actionsSrc.indexOf("confirmHotelWithProvider(draft, traveler, myGoAccess)")
  assert.ok(backstopIdx > 0, "le backstop doit exister")
  assert.ok(providerCallIdx > 0, "l'appel fournisseur doit exister")
  assert.ok(backstopIdx < providerCallIdx, "le backstop doit s'exécuter AVANT confirmHotelWithProvider")
})

test("createReservationFromDraft : l'insert reservations écrit idempotencyKey dans guestIdempotencyKey (même colonne/index que le guest checkout — aucune migration nécessaire)", () => {
  assert.equal(countOccurrences(actionsSrc, "guestIdempotencyKey: idempotencyKey,"), 1)
})

test("createReservationFromDraft : l'insert reservations tourne dans une sous-transaction avec catch explicite du code Postgres 23505 (violation d'unicité) — jamais une erreur générique qui masquerait une course gagnée par une autre requête", () => {
  assert.match(actionsSrc, /tx\.transaction\(\(tx2\) =>\s*\n\s*tx2\s*\n\s*\.insert\(reservations\)/)
  assert.match(actionsSrc, /if \(pgErrorCode\(err\) === "23505"\) \{\s*\n\s*return \{ conflict: true as const \}/)
})

test("createReservationFromDraft : en cas de conflit (course gagnée par une autre requête), compense le hold myGo redondant PUIS renvoie la réservation gagnante — jamais une simple erreur générique masquant un succès réel", () => {
  const conflictBlockMatch = actionsSrc.match(
    /if \(result\.conflict\) \{[\s\S]{0,900}?findReservationByCheckoutIdempotencyKey\(agencyId, idempotencyKey\)[\s\S]{0,200}?\}/,
  )
  assert.ok(conflictBlockMatch, "le bloc de gestion du conflit doit exister et relire la réservation gagnante")
})
