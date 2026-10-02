/**
 * PHASE 27.2 — invariants statiques de continuité de compte tenant sur
 * `lib/booking/actions.ts` / `lib/booking/guest-actions.ts`.
 *
 * Ces deux fichiers portent `"use server"` et importent transitivement
 * `"server-only"` (via `lib/pro/server-context.ts`) — ils ne peuvent donc
 * pas être chargés par `node --test`/tsx en dehors du bundler Next.js (même
 * contrainte déjà documentée pour `guestTenantContext()`, voir
 * lib/hotel-suppliers/tenant/live-resolution.ts). Un test comportemental
 * réel (mock DB/Supabase + appel direct de `createReservationFromDraft`)
 * n'est donc pas possible ici sans modifier ces modules pour les rendre
 * testables hors Next.js — hors périmètre de cette phase.
 *
 * Ce fichier vérifie à la place, sur le CODE SOURCE réel, l'invariant P0 de
 * la mission 27.2 : le compte fournisseur myGo tenant-résolu
 * (`myGoAccess`/`ResolvedMyGoAccess`) est résolu UNE SEULE FOIS par
 * tentative de réservation, puis explicitement RÉUTILISÉ pour BOOK ET pour
 * toute compensation (annulation) — jamais un second `getMyGoClient()`
 * global "nu" ni une seconde résolution tenant. Vérification positive
 * (présence des motifs attendus, au bon nombre d'occurrences) plutôt
 * qu'une preuve négative exhaustive par regex — un test comportemental
 * resterait préférable si ces modules deviennent un jour testables
 * directement hors Next.js.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const actionsSrc = readFileSync(
  join(process.cwd(), "lib/booking/actions.ts"),
  "utf8",
)
const guestActionsSrc = readFileSync(
  join(process.cwd(), "lib/booking/guest-actions.ts"),
  "utf8",
)

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

function normalizeCode(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .replace(/,\s*\)/g, ")")
    .replace(/,\s*\}/g, "}")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/\{\s+/g, "{")
    .replace(/\s+\}/g, "}")
}

test("lib/booking/actions.ts : confirmHotelWithProvider() est appelée avec le compte tenant résolu (myGoAccess), jamais sans 3e argument", () => {
  assert.equal(
    countOccurrences(
      normalizeCode(actionsSrc),
      "confirmHotelWithProvider(draft, traveler, myGoAccess)",
    ),
    1,
  )
})

test("lib/booking/actions.ts : resolveMyGoAccessForTenant() n'est appelée qu'UNE SEULE FOIS dans createReservationFromDraft", () => {
  assert.equal(
    countOccurrences(actionsSrc, "await resolveMyGoAccessForTenant("),
    1,
  )
})

test("lib/booking/actions.ts : confirmHotelWithProvider() utilise le client tenant résolu (access.client), avec repli explicite global uniquement si non configuré", () => {
  assert.equal(
    countOccurrences(
      actionsSrc,
      "const client = access.client ?? getMyGoClient()",
    ),
    1,
  )
})

test("lib/booking/actions.ts : les 2 sites de compensation (conflit idempotence B2B, catch général) annulent via myGoAccess.client — MÊME compte que la création, jamais un client re-résolu", () => {
  assert.equal(
    countOccurrences(
      normalizeCode(actionsSrc),
      normalizeCode(
        "await (myGoAccess.client ?? getMyGoClient()).cancelBooking({ bookingId: myGoBooking.bookingId })",
      ),
    ),
    2,
  )
})

test("lib/booking/guest-actions.ts : confirmHotelWithProvider() est appelée avec le compte tenant résolu (myGoAccess), jamais sans 3e argument", () => {
  assert.equal(
    countOccurrences(
      normalizeCode(guestActionsSrc),
      "confirmHotelWithProvider(draft, traveler, myGoAccess)",
    ),
    1,
  )
})

test("lib/booking/guest-actions.ts : resolveMyGoAccessForTenant() n'est appelée qu'UNE SEULE FOIS dans runCreateGuestReservation", () => {
  assert.equal(
    countOccurrences(guestActionsSrc, "resolveMyGoAccessForTenant("),
    1,
  )
})

test("lib/booking/guest-actions.ts : les 4 sites de compensation (drift de prix CART-DRIFT-01, hold carte, conflit idempotence, catch général) annulent tous via myGoAccess.client — MÊME compte que la création", () => {
  // CART-DRIFT-01 a ajouté un 4e site : le rejet PRICE_CHANGED (prix
  // recalculé serveur matériellement différent du montant affiché au
  // panier) compense le hold myGo exactement comme les 3 autres rejets déjà
  // couverts ici — jamais un second client/compte re-résolu.
  assert.equal(
    countOccurrences(
      normalizeCode(guestActionsSrc),
      normalizeCode(
        "(myGoAccess.client ?? getMyGoClient()).cancelBooking({ bookingId: myGoBooking.bookingId })",
      ),
    ),
    4,
  )
})
