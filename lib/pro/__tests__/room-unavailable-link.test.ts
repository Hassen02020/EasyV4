/**
 * Tests pour lib/pro/room-unavailable-link.ts (Phase 30.4).
 *
 * Régression ciblée : le lien "Retour aux chambres" doit toujours porter
 * cityId/checkin/checkout/adults quand ils sont connus — sinon
 * /pro/hotels/[id] (qui EXIGE cityId) affiche "Recherche incomplète" au
 * lieu de réellement renvoyer l'agent vers les chambres de l'hôtel.
 */

import { strict as assert } from "node:assert"
import { test } from "node:test"
import { buildUnavailableRoomBackHref } from "../room-unavailable-link"

test("buildUnavailableRoomBackHref : porte tous les paramètres connus (cas nominal)", () => {
  const href = buildUnavailableRoomBackHref("123", {
    cityId: "10",
    checkin: "2026-07-15",
    checkout: "2026-07-20",
    adults: "2",
  })
  const [path, qs] = href.split("?")
  assert.equal(path, "/pro/hotels/123")
  const params = new URLSearchParams(qs)
  assert.equal(params.get("cityId"), "10")
  assert.equal(params.get("checkin"), "2026-07-15")
  assert.equal(params.get("checkout"), "2026-07-20")
  assert.equal(params.get("adults"), "2")
})

test("buildUnavailableRoomBackHref : cityId absent → jamais fabriqué, simplement omis", () => {
  const href = buildUnavailableRoomBackHref("123", {
    checkin: "2026-07-15",
    checkout: "2026-07-20",
  })
  const params = new URLSearchParams(href.split("?")[1])
  assert.equal(params.has("cityId"), false)
  assert.equal(params.get("checkin"), "2026-07-15")
})

test("buildUnavailableRoomBackHref : aucun paramètre connu → lien vers l'hôtel sans query", () => {
  const href = buildUnavailableRoomBackHref("123", {})
  assert.equal(href, "/pro/hotels/123?")
})
