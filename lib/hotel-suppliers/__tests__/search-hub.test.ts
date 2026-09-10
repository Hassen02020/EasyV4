/**
 * PHASE 28 — tests de `lib/hotel-suppliers/search-hub.ts`, le point d'entrée
 * Hub pour la recherche hôtel de production. Exercé en mode démo (aucun
 * MYGO_LOGIN dans cet environnement de test — voir lib/mygo/__tests__/
 * search-core.test.ts pour la même convention) : déterministe, sans réseau,
 * même fixture que /api/hotels/search en local/preview.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { HotelSearchQuerySchema } from "@/lib/mygo/search-core"
import {
  buildHubSearchRequestFromQuery,
  runSearchThroughHub,
  logHubSearchObservability,
  executeHotelSearchThroughHub,
} from "../search-hub"
import { executeHotelSearch } from "@/lib/mygo/search-core"

const KNOWN_CITY_ID = "10" // présent dans le fixture démo (voir search-core.test.ts)
const UNKNOWN_CITY_ID = "999999"

function knownCityQuery() {
  return HotelSearchQuerySchema.parse({
    cityId: KNOWN_CITY_ID,
    checkin: "2026-09-01",
    checkout: "2026-09-05",
    adults: "2",
  })
}

test("buildHubSearchRequestFromQuery : traduit la query validée sans rien inventer", () => {
  const q = HotelSearchQuerySchema.parse({
    cityId: "42",
    checkin: "2026-09-01",
    checkout: "2026-09-05",
    adults: "3",
    children: "5,7",
    stars: "4,5",
  })
  const req = buildHubSearchRequestFromQuery(q)
  assert.equal(req.destinationId, "42")
  assert.equal(req.checkIn, "2026-09-01")
  assert.equal(req.checkOut, "2026-09-05")
  assert.equal(req.currency, "TND")
  assert.deepEqual(req.rooms, [{ adults: 3, childAges: [5, 7] }])
  assert.deepEqual(req.stars, [4, 5])
  // HotelSearchQuerySchema résout `onlyAvailable` en booléen TOUJOURS défini
  // (jamais undefined) — absent de la query => false, comportement identique
  // au pipeline natif (runRealHotelSearch), pas une régression introduite ici.
  assert.equal(req.onlyAvailable, false)
})

test("runSearchThroughHub (démo, ville connue) : MyGo SUCCESS, résultats normalisés non vides, les 3 autres NOT_CONFIGURED (catégorie 1+10)", async () => {
  const q = knownCityQuery()
  const { runResult, hubResult } = await runSearchThroughHub(q)

  assert.equal(runResult.ok, true)
  if (runResult.ok) assert.ok(runResult.dto.count > 0)

  assert.equal(hubResult.supplierStatus.mygo, "SUCCESS")
  assert.equal(hubResult.supplierStatus["tunisia-bed"], "NOT_CONFIGURED")
  assert.equal(hubResult.supplierStatus.cyberesa, "NOT_CONFIGURED")
  assert.equal(hubResult.supplierStatus["3t"], "NOT_CONFIGURED")
  assert.equal(hubResult.failedSuppliers.includes("mygo"), false)
  assert.ok(hubResult.results.length > 0, "les hôtels normalisés doivent être non vides")
  assert.ok(hubResult.rates.length > 0, "les tarifs normalisés doivent être non vides")
})

test("runSearchThroughHub : les 3 fournisseurs NOT_CONFIGURED ne cassent jamais la recherche myGo (catégorie 3)", async () => {
  const q = knownCityQuery()
  const { runResult } = await runSearchThroughHub(q)
  assert.equal(runResult.ok, true)
  if (runResult.ok) assert.ok(runResult.dto.offers.length > 0)
})

test("runSearchThroughHub : un correlationId est toujours renvoyé (fourni ou généré)", async () => {
  const q = knownCityQuery()
  const { hubResult } = await runSearchThroughHub(q, undefined, "test-correlation-42")
  assert.equal(hubResult.correlationId, "test-correlation-42")
  const { hubResult: generated } = await runSearchThroughHub(q)
  assert.ok(generated.correlationId.length > 0)
})

test("runSearchThroughHub : les résultats normalisés proviennent EXACTEMENT du DTO déjà récupéré — aucune seconde recherche (catégorie 11+13)", async () => {
  const q = knownCityQuery()
  const { runResult, hubResult } = await runSearchThroughHub(q)
  assert.equal(runResult.ok, true)
  if (!runResult.ok) return
  const uniqueHotelIds = new Set(runResult.dto.offers.map((o) => o.hotel.id)).size
  const totalRoomOffers = runResult.dto.offers.reduce(
    (sum, o) => sum + o.boardings.reduce((s, b) => s + b.pax.reduce((s2, p) => s2 + p.rooms.length, 0), 0),
    0,
  )
  // deduplicateHotels() ne peut que FUSIONNER des hôtels (jamais en créer) —
  // le nombre de groupes est donc <= au nombre d'hôtels bruts, jamais plus.
  assert.ok(hubResult.results.length > 0 && hubResult.results.length <= uniqueHotelIds)
  // Traçabilité : AUCUN tarif ne doit disparaître pendant le regroupement,
  // même quand des hôtels sont fusionnés en groupes.
  assert.equal(hubResult.rates.length, totalRoomOffers)
})

test("runSearchThroughHub : ne recalcule jamais la marge — sellingPrice normalisé == room.price brut du DTO myGo (catégorie 16)", async () => {
  const q = knownCityQuery()
  const { runResult, hubResult } = await runSearchThroughHub(q)
  assert.equal(runResult.ok, true)
  if (!runResult.ok) return
  const firstOffer = runResult.dto.offers[0]
  assert.ok(firstOffer, "le fixture doit avoir au moins une offre")
  const firstRoom = firstOffer.boardings[0]?.pax[0]?.rooms[0]
  assert.ok(firstRoom, "l'offre doit avoir au moins une chambre")
  const matchingRate = hubResult.rates.find(
    (r) => r.hotelId === String(firstOffer.hotel.id) && r.roomId === String(firstRoom.id),
  )
  assert.ok(matchingRate, "le tarif normalisé correspondant doit exister")
  assert.equal(matchingRate!.sellingPrice, firstRoom.price)
})

test("runSearchThroughHub : supplierToken reste opaque — jamais interprétable comme un login/password (catégorie 18)", async () => {
  const q = knownCityQuery()
  const { hubResult } = await runSearchThroughHub(q)
  for (const rate of hubResult.rates) {
    assert.ok(rate.supplierToken, "chaque tarif myGo doit porter un supplierToken")
    assert.doesNotMatch(rate.supplierToken!, /login|password|MYGO_/i)
  }
})

test("logHubSearchObservability : jamais de credentials/tokens dans les champs journalisés (catégorie 19)", async () => {
  const q = knownCityQuery()
  const { hubResult } = await runSearchThroughHub(q)
  const logged: unknown[] = []
  const originalInfo = (await import("@/lib/logger")).logger.info
  ;(await import("@/lib/logger")).logger.info = (...args: unknown[]) => {
    logged.push(args)
  }
  try {
    logHubSearchObservability(hubResult, { agencyId: "agency-1", tenantId: "tenant-1", supplierAccountId: "account-1" })
  } finally {
    ;(await import("@/lib/logger")).logger.info = originalInfo
  }
  assert.ok(logged.length > 0)
  for (const call of logged) {
    const [, ctx] = call as [string, Record<string, unknown>]
    const serialized = JSON.stringify(ctx)
    assert.doesNotMatch(serialized, /login|password|secret|MYGO_LOGIN|MYGO_PASSWORD/i)
    assert.equal("client" in ctx, false)
    assert.equal("driver" in ctx, false)
  }
})

test("executeHotelSearchThroughHub : réponse HTTP identique (statut/headers/corps) à l'ancien executeHotelSearch() — contrat inchangé (catégorie 17)", async () => {
  const q = knownCityQuery()
  const legacy = await executeHotelSearch(q)
  const hubResp = await executeHotelSearchThroughHub(q, undefined)

  assert.equal(hubResp.status, legacy.status)
  const legacyBody = await legacy.json()
  const hubBody = await hubResp.json()
  assert.deepEqual(hubBody, legacyBody)
  assert.equal(hubResp.headers.get("x-demo-mode"), legacy.headers.get("x-demo-mode"))
})

test("executeHotelSearchThroughHub (démo, ville inconnue) : zéro résultat, jamais une erreur — repli démo inchangé (catégorie 20)", async () => {
  const q = HotelSearchQuerySchema.parse({
    cityId: UNKNOWN_CITY_ID,
    checkin: "2026-09-01",
    checkout: "2026-09-05",
    adults: "2",
  })
  const resp = await executeHotelSearchThroughHub(q, undefined)
  assert.equal(resp.status, 200)
  const body = await resp.json()
  assert.equal(body.count, 0)
  assert.deepEqual(body.offers, [])
})

test("runSearchThroughHub : sans compte tenant résolu (access undefined) — repli global/démo historique, MyGo reste SUCCESS (jamais un faux NOT_CONFIGURED)", async () => {
  // En mode démo (MYGO_LOGIN absent), MyGoDriver.getConfigStatus() renverrait
  // NOT_CONFIGURED (credentials réellement absentes) — mais runHotelSearch()
  // sert quand même le fixture démo. Le passthrough doit refléter "un
  // résultat a bien été obtenu", pas les credentials brutes — sinon la
  // recherche démo serait à tort rapportée NOT_CONFIGURED alors que des
  // résultats réels existent (régression du comportement historique).
  const q = knownCityQuery()
  const { runResult, hubResult } = await runSearchThroughHub(q)
  assert.equal(runResult.ok, true)
  assert.equal(hubResult.supplierStatus.mygo, "SUCCESS")
})

test("runSearchThroughHub : le passthrough reflète fidèlement un échec réel de runHotelSearch (jamais un faux SUCCESS)", async () => {
  // Force le chemin réel (pas démo) via un client tenant qui échoue toujours
  // à la recherche — le passthrough ne doit jamais masquer cet échec.
  const q = knownCityQuery()
  const failingClient = {
    searchHotels: async () => {
      throw new Error("simulated upstream failure")
    },
  } as unknown as import("@/lib/mygo/client").MyGoClient
  const fakeDriver = { getConfigStatus: () => "CONFIGURED" as const } as unknown as import("../mygo/driver").MyGoDriver
  const { runResult, hubResult } = await runSearchThroughHub(q, {
    client: failingClient,
    driver: fakeDriver,
    accountId: "fake-account",
  })
  assert.equal(runResult.ok, false)
  assert.equal(hubResult.supplierStatus.mygo, "ERROR")
})
