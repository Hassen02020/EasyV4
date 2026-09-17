/**
 * PHASE PREMIUM 2 — Chantier 6 (Pagination SERP).
 * `buildPageWindow` est une fonction pure — pas de dépendance DB/server-only
 * (contrairement à `hooks/use-paginated-results.ts`, un hook client, et aux
 * pages Packages/Attractions/Omra, qui passent par `getDefaultAgencyId()` et
 * héritent de la même limite `server-only` que le reste de cette famille de
 * fonctions — voir lib/destinations/__tests__/package-search-terms.test.ts).
 */
import test from "node:test"
import assert from "node:assert/strict"
import { buildPageWindow } from "@/lib/pagination-window"

test("buildPageWindow — une seule page renvoie juste [1]", () => {
  assert.deepEqual(buildPageWindow(1, 1), [1])
})

test("buildPageWindow — peu de pages : aucune ellipse", () => {
  assert.deepEqual(buildPageWindow(1, 3), [1, 2, 3])
  assert.deepEqual(buildPageWindow(3, 5), [1, 2, 3, 4, 5])
})

test("buildPageWindow — beaucoup de pages, page courante au milieu : ellipses des deux côtés", () => {
  assert.deepEqual(buildPageWindow(10, 20), [1, "ellipsis", 9, 10, 11, "ellipsis", 20])
})

test("buildPageWindow — page courante proche du début : pas d'ellipse à gauche", () => {
  assert.deepEqual(buildPageWindow(2, 20), [1, 2, 3, "ellipsis", 20])
})

test("buildPageWindow — page courante proche de la fin : pas d'ellipse à droite", () => {
  assert.deepEqual(buildPageWindow(19, 20), [1, "ellipsis", 18, 19, 20])
})

test("buildPageWindow — première et dernière page toujours incluses", () => {
  const window = buildPageWindow(50, 100)
  assert.equal(window[0], 1)
  assert.equal(window[window.length - 1], 100)
})
