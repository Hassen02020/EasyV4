/**
 * HOTEL-B2B-DOUBLE-BOOKING-LOCK-01 — invariants statiques sur le câblage du
 * verrou d'inventaire (lib/booking/inventory.ts) dans le chemin de
 * réservation hôtel B2B (lib/booking/actions.ts::createReservationFromDraft).
 *
 * Défaut d'origine : contrairement au chemin guest/B2C
 * (lib/booking/guest-actions.ts), `createReservationFromDraft` n'appelait
 * jamais `acquireLock()` avant `confirmHotelWithProvider()` — deux requêtes
 * B2B concurrentes pour LA MÊME offre (deux onglets, deux agents de la même
 * agence) pouvaient toutes deux appeler myGo pour la même chambre.
 * `reservations_guest_idempotency_uniq` protège uniquement un retry
 * IDENTIQUE (même hash draft+traveler), jamais deux tentatives concurrentes
 * distinctes sur la même offre.
 *
 * La correction primitive (acquireLock/releaseLock, SET NX EX atomique,
 * fail-closed sans Redis) est déjà prouvée par concurrence réelle dans
 * lib/booking/__tests__/inventory.test.ts (y compris un cas
 * `module: "hotel"` à deux sessions concurrentes). Ce fichier-ci prouve
 * uniquement le CÂBLAGE : que actions.ts appelle bien cette primitive déjà
 * correcte, au bon endroit, et la libère sur CHAQUE sortie — même
 * discipline que lib/booking/__tests__/mygo-hotel-commission-wiring.test.ts.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const actionsSrc = readFileSync(join(ROOT, "lib/booking/actions.ts"), "utf8")
const guestSrc = readFileSync(
  join(ROOT, "lib/booking/guest-actions.ts"),
  "utf8",
)

test("HOTEL-B2B-DOUBLE-BOOKING-LOCK-01 : acquireLock est appelé avec module:'hotel' et itemId:draft.offerId", () => {
  assert.match(actionsSrc, /module:\s*["']hotel["']/)
  assert.match(actionsSrc, /itemId:\s*draft\.offerId/)
})

test("HOTEL-B2B-DOUBLE-BOOKING-LOCK-01 : acquireLock précède confirmHotelWithProvider (verrou posé AVANT l'appel myGo)", () => {
  const lockIdx = actionsSrc.indexOf("await acquireLock({")
  const providerIdx = actionsSrc.indexOf(
    "const providerConfirmation = await confirmHotelWithProvider(",
  )
  assert.ok(lockIdx > 0, "acquireLock doit exister dans actions.ts")
  assert.ok(providerIdx > 0, "confirmHotelWithProvider doit exister")
  assert.ok(
    lockIdx < providerIdx,
    "acquireLock doit précéder confirmHotelWithProvider — sinon deux requêtes concurrentes appellent myGo avant toute exclusion",
  )
})

test("HOTEL-B2B-DOUBLE-BOOKING-LOCK-01 : lockResult.ok===false retourne une erreur sans jamais appeler myGo", () => {
  const lockIdx = actionsSrc.indexOf("await acquireLock({")
  const guardIdx = actionsSrc.indexOf("if (!lockResult.ok) {", lockIdx)
  const providerIdx = actionsSrc.indexOf(
    "const providerConfirmation = await confirmHotelWithProvider(",
  )
  assert.ok(guardIdx > lockIdx)
  assert.ok(
    guardIdx < providerIdx,
    "le refus de verrou doit être traité avant tout appel fournisseur",
  )
})

test("HOTEL-B2B-DOUBLE-BOOKING-LOCK-01 : releaseInventoryLock est appelé sur CHAQUE sortie après acquisition (échec fournisseur, !myGoBooking, conflit DB, succès, catch)", () => {
  const releaseCalls = actionsSrc.match(/await releaseInventoryLock\(/g) ?? []
  assert.ok(
    releaseCalls.length >= 5,
    `attendu au moins 5 appels à releaseInventoryLock (échec fournisseur, !myGoBooking, conflit, succès, catch) — trouvé ${releaseCalls.length}`,
  )
})

test("HOTEL-B2B-DOUBLE-BOOKING-LOCK-01 : le succès libère le verrou AVEC reservationId (marque 'confirmed', pas juste 'released')", () => {
  assert.match(
    actionsSrc,
    /await releaseInventoryLock\(result\.reservationId\)/,
  )
})

test("HOTEL-B2B-DOUBLE-BOOKING-LOCK-01 : le bloc catch de createReservationFromDraft libère systématiquement le verrou (jamais de verrou orphelin sur erreur inattendue)", () => {
  // Le premier "} catch (err) {" du fichier appartient à
  // confirmHotelWithProvider (classification d'erreur myGo, sans rapport) —
  // on cherche celui qui suit directement le succès de la transaction
  // (await releaseInventoryLock(result.reservationId)), qui est le seul
  // catch englobant tout createReservationFromDraft.
  const successReleaseIdx = actionsSrc.indexOf(
    "await releaseInventoryLock(result.reservationId)",
  )
  assert.ok(successReleaseIdx > 0)
  const catchIdx = actionsSrc.indexOf("} catch (err) {", successReleaseIdx)
  assert.ok(
    catchIdx > successReleaseIdx,
    "le catch de createReservationFromDraft doit suivre son return de succès",
  )
  const afterCatch = actionsSrc.slice(catchIdx, catchIdx + 200)
  assert.match(afterCatch, /await releaseInventoryLock\(\)/)
})

test("HOTEL-B2B-DOUBLE-BOOKING-LOCK-01 : parité avec le chemin guest/B2C — les deux utilisent itemId:draft.offerId pour le même module 'hotel'", () => {
  // Les deux chemins doivent verrouiller la MÊME clé logique (agence +
  // module hotel + offerId) pour qu'un verrou posé côté B2B bloque bien
  // une tentative concurrente côté guest sur la même offre, et vice-versa.
  assert.match(guestSrc, /module:\s*["']hotel["']/)
  assert.match(guestSrc, /itemId:\s*draft\.offerId/)
  assert.match(actionsSrc, /module:\s*["']hotel["']/)
  assert.match(actionsSrc, /itemId:\s*draft\.offerId/)
})
