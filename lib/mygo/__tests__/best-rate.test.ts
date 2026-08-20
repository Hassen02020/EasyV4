/**
 * Tests unitaires pour `lib/mygo/best-rate.ts` (Best Rate Engine).
 */

import test from "node:test"
import assert from "node:assert/strict"
import { selectBestRate } from "../best-rate"
import type { HotelOfferDTO } from "../types"

function makeOffer(boardings: { name: string; price: number }[]): HotelOfferDTO {
  return {
    hotel: { id: 1, name: "Test Hotel", facilities: [], themes: [] },
    token: "token-1",
    currency: "TND",
    fromPrice: Math.min(...boardings.map((b) => b.price)),
    recommended: false,
    boardings: boardings.map((b, i) => ({
      id: i,
      code: b.name.slice(0, 3).toUpperCase(),
      name: b.name,
      pax: [
        {
          adult: 2,
          child: [],
          rooms: [
            {
              id: 100 + i,
              name: "Standard",
              price: b.price,
              stopReservation: false,
              notRefundable: false,
              cancellationPolicies: [],
            },
          ],
        },
      ],
    })),
  }
}

test("selectBestRate sans filtre : renvoie la pension globale la moins chère", () => {
  const offer = makeOffer([
    { name: "Petit-déjeuner", price: 250 },
    { name: "All Inclusive", price: 380 },
  ])
  const rate = selectBestRate(offer, [])
  assert.deepEqual(rate, { price: 250, boardingName: "Petit-déjeuner" })
})

test("selectBestRate avec filtre pension actif : bascule sur le moins cher de la pension filtrée, pas le moins cher global", () => {
  const offer = makeOffer([
    { name: "Petit-déjeuner", price: 250 },
    { name: "All Inclusive", price: 380 },
  ])
  const rate = selectBestRate(offer, ["All Inclusive"])
  assert.deepEqual(rate, { price: 380, boardingName: "All Inclusive" })
})

test("selectBestRate : plusieurs pensions filtrées simultanément, garde la moins chère parmi elles", () => {
  const offer = makeOffer([
    { name: "Petit-déjeuner", price: 250 },
    { name: "Demi-pension", price: 300 },
    { name: "All Inclusive", price: 380 },
  ])
  const rate = selectBestRate(offer, ["Demi-pension", "All Inclusive"])
  assert.deepEqual(rate, { price: 300, boardingName: "Demi-pension" })
})

test("selectBestRate : filtre ne correspondant à aucune pension de l'offre replie sur toutes les chambres", () => {
  const offer = makeOffer([{ name: "Petit-déjeuner", price: 250 }])
  const rate = selectBestRate(offer, ["All Inclusive"])
  assert.deepEqual(rate, { price: 250, boardingName: "Petit-déjeuner" })
})

test("selectBestRate : offre sans aucune chambre renvoie null", () => {
  const offer: HotelOfferDTO = {
    hotel: { id: 1, name: "Empty", facilities: [], themes: [] },
    token: "t",
    currency: "TND",
    fromPrice: 0,
    recommended: false,
    boardings: [],
  }
  assert.equal(selectBestRate(offer, []), null)
})
