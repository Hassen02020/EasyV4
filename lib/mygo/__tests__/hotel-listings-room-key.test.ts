/**
 * Régression Phase 36 — bug confirmé en environnement réel (React "duplicate
 * key" + Réserver résolvant sur la mauvaise pension) : myGo réutilise le
 * même `room.id` pour le même type de chambre à travers PLUSIEURS pensions
 * (ex. "Chambre Familiale" id=5900410 sous "Logement Simple" ET "Logement
 * Petit Déjeuner"). `toCardShape()` doit produire une `key` UNIQUE par ligne
 * réellement affichée, distincte de `id` (qui doit rester le vrai roomId
 * myGo, utilisé tel quel pour BookingCreation).
 */

import { strict as assert } from "node:assert"
import { test } from "node:test"
import { toCardShape } from "../../../components/hotel-listings"
import type { HotelOfferDTO } from "../types"

test("toCardShape : room.key reste unique même quand myGo réutilise le même room.id sur plusieurs pensions", () => {
  // Reproduction exacte du fixture réel (hôtel 500041) : room.id 5900410
  // ("Chambre Familiale") apparaît identique sous 2 boardings différents.
  const offer: HotelOfferDTO = {
    hotel: { id: 500041, name: "Virtual Hotel 041", facilities: [], themes: [] },
    token: "tok",
    currency: "TND",
    fromPrice: 576,
    recommended: false,
    boardings: [
      {
        id: 3,
        code: "RO",
        name: "Logement Simple",
        pax: [
          {
            adult: 2,
            child: [],
            rooms: [
              {
                id: 5900410,
                name: "Chambre Familiale",
                price: 576,
                stopReservation: false,
                notRefundable: false,
                cancellationPolicies: [],
              },
            ],
          },
        ],
      },
      {
        id: 4,
        code: "BB",
        name: "Logement Petit Déjeuner",
        pax: [
          {
            adult: 2,
            child: [],
            rooms: [
              {
                id: 5900410,
                name: "Chambre Familiale",
                price: 662,
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

  const shape = toCardShape(offer)
  const rooms = shape.rooms ?? []
  assert.equal(rooms.length, 2, "les 2 lignes (une par pension) doivent être présentes")

  // Les 2 lignes partagent le même `id` myGo (comportement fournisseur réel)…
  assert.equal(rooms[0]!.id, 5900410)
  assert.equal(rooms[1]!.id, 5900410)

  // …mais leur `key` UI doit être différente, sinon React les traite comme
  // le MÊME élément (duplicate key) et la sélection/résa peut résoudre sur
  // la mauvaise pension/le mauvais prix.
  assert.notEqual(rooms[0]!.key, rooms[1]!.key)
  const keys = new Set(rooms.map((r) => r.key))
  assert.equal(keys.size, rooms.length, "toutes les clés doivent être uniques")

  // Chaque ligne garde son vrai prix/pension propre (pas de collision de
  // données, seulement de l'identifiant myGo brut).
  const simple = rooms.find((r) => r.boardingName === "Logement Simple")
  const bb = rooms.find((r) => r.boardingName === "Logement Petit Déjeuner")
  assert.equal(simple?.price, 576)
  assert.equal(bb?.price, 662)
})
