import test from "node:test"
import assert from "node:assert/strict"
import { safeInternalRedirect } from "../safe-redirect"

const ORIGIN = "https://easy2book.tn"

test("safeInternalRedirect : accepte un chemin relatif interne normal", () => {
  assert.equal(safeInternalRedirect("/admin/reservations", ORIGIN, "/admin"), "/admin/reservations")
})

test("safeInternalRedirect : accepte la racine", () => {
  assert.equal(safeInternalRedirect("/", ORIGIN, "/"), "/")
})

test("safeInternalRedirect : fallback si paramètre absent", () => {
  assert.equal(safeInternalRedirect(null, ORIGIN, "/admin"), "/admin")
})

test("safeInternalRedirect : rejette une URL protocole-relative (open redirect classique)", () => {
  assert.equal(safeInternalRedirect("//evil.com", ORIGIN, "/admin"), "/admin")
})

test("safeInternalRedirect : rejette une URL absolue vers un autre domaine", () => {
  assert.equal(safeInternalRedirect("https://evil.com", ORIGIN, "/admin"), "/admin")
})

test("safeInternalRedirect : rejette la variante backslash (contournement du parseur WHATWG)", () => {
  assert.equal(safeInternalRedirect("/\\evil.com", ORIGIN, "/admin"), "/admin")
})

test("safeInternalRedirect : rejette un schéma javascript:", () => {
  assert.equal(safeInternalRedirect("javascript:alert(1)", ORIGIN, "/admin"), "/admin")
})

test("safeInternalRedirect : accepte une URL absolue vers le MÊME domaine", () => {
  assert.equal(
    safeInternalRedirect(`${ORIGIN}/pro/reservations`, ORIGIN, "/admin"),
    `${ORIGIN}/pro/reservations`,
  )
})
