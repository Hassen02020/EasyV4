/**
 * Tests pour la state machine de transition de statut d'une réservation
 * (back-office). On ne teste pas l'action serveur complète (qui dépend de
 * la BDD + de Supabase) ; on isole la logique pure `isTransitionAllowed`.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import {
  RESERVATION_STATUSES,
  isTransitionAllowed,
  type ReservationStatus,
} from "@/lib/admin/reservation-status"

test("RESERVATION_STATUSES expose les 7 statuts métier", () => {
  assert.deepEqual(
    [...RESERVATION_STATUSES].sort(),
    [
      "cancelled",
      "completed",
      "confirmed",
      "no_show",
      "on_request",
      "pending",
      "refunded",
    ],
  )
})

test("transitions autorisées depuis pending", () => {
  assert.equal(isTransitionAllowed("pending", "confirmed"), true)
  assert.equal(isTransitionAllowed("pending", "on_request"), true)
  assert.equal(isTransitionAllowed("pending", "cancelled"), true)
  assert.equal(isTransitionAllowed("pending", "completed"), false)
  assert.equal(isTransitionAllowed("pending", "refunded"), false)
})

test("transitions autorisées depuis confirmed", () => {
  assert.equal(isTransitionAllowed("confirmed", "cancelled"), true)
  assert.equal(isTransitionAllowed("confirmed", "completed"), true)
  assert.equal(isTransitionAllowed("confirmed", "refunded"), true)
  assert.equal(isTransitionAllowed("confirmed", "pending"), false)
})

test("transition vers le même statut interdite", () => {
  for (const s of RESERVATION_STATUSES) {
    assert.equal(
      isTransitionAllowed(s, s),
      false,
      `no-op ${s} -> ${s} doit être bloqué`,
    )
  }
})

test("refunded est terminal (aucune transition sortante)", () => {
  for (const s of RESERVATION_STATUSES) {
    if (s === "refunded") continue
    assert.equal(
      isTransitionAllowed("refunded", s),
      false,
      `refunded -> ${s} doit être bloqué`,
    )
  }
})

test("cancelled -> pending permis (cas de réouverture exceptionnelle)", () => {
  assert.equal(isTransitionAllowed("cancelled", "pending"), true)
  assert.equal(isTransitionAllowed("cancelled", "confirmed"), false)
})

test("no_show -> refunded permis, autres bloqués", () => {
  assert.equal(isTransitionAllowed("no_show", "refunded"), true)
  assert.equal(isTransitionAllowed("no_show", "confirmed"), false)
  assert.equal(isTransitionAllowed("no_show", "completed"), false)
})

test("statut inconnu rejeté", () => {
  assert.equal(
    isTransitionAllowed("draft" as ReservationStatus, "confirmed"),
    false,
  )
})
