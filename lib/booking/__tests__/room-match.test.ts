import test from "node:test"
import assert from "node:assert/strict"

import { matchSelectedRoom } from "../room-match"
import type { HotelOfferDTO } from "@/lib/mygo/types"

function makeOffer(): HotelOfferDTO {
  return {
    hotel: { id: 646, name: "Yocca Hotel Residence", facilities: [], themes: [] },
    token: "tok-abc",
    currency: "TND",
    fromPrice: 250,
    recommended: false,
    boardings: [
      {
        id: 10,
        code: "BB",
        name: "Petit-déjeuner",
        pax: [
          {
            adult: 2,
            child: [],
            rooms: [
              {
                id: 100,
                name: "Chambre Double",
                price: 250,
                stopReservation: false,
                notRefundable: false,
                cancellationPolicies: [],
              },
              {
                id: 101,
                name: "Chambre Twin",
                price: 260,
                stopReservation: true,
                notRefundable: false,
                cancellationPolicies: [],
              },
            ],
          },
        ],
      },
      {
        id: 20,
        code: "AI",
        name: "All Inclusive",
        pax: [
          {
            adult: 2,
            child: [],
            rooms: [
              {
                id: 100,
                name: "Chambre Double",
                price: 320,
                stopReservation: false,
                notRefundable: false,
                cancellationPolicies: [],
              },
            ],
          },
        ],
      },
    ],
  }
}

test("matchSelectedRoom : retrouve la chambre exacte (boardingId + roomId)", () => {
  const offer = makeOffer()
  const match = matchSelectedRoom(offer, 10, 100)
  assert.ok(match)
  assert.equal(match?.boarding.id, 10)
  assert.equal(match?.room.id, 100)
  assert.equal(match?.room.price, 250)
})

test("matchSelectedRoom : le même roomId sous une pension différente n'est pas confondu", () => {
  const offer = makeOffer()
  const match = matchSelectedRoom(offer, 20, 100)
  assert.ok(match)
  assert.equal(match?.boarding.code, "AI")
  assert.equal(match?.room.price, 320)
})

test("matchSelectedRoom : retourne null si la chambre est passée stopReservation", () => {
  const offer = makeOffer()
  const match = matchSelectedRoom(offer, 10, 101)
  assert.equal(match, null)
})

test("matchSelectedRoom : retourne null si le boardingId n'existe plus", () => {
  const offer = makeOffer()
  const match = matchSelectedRoom(offer, 999, 100)
  assert.equal(match, null)
})

test("matchSelectedRoom : retourne null si le roomId n'existe plus dans cette pension", () => {
  const offer = makeOffer()
  const match = matchSelectedRoom(offer, 10, 999)
  assert.equal(match, null)
})
