import test from "node:test"
import assert from "node:assert/strict"
import { getWorldHotelBookingBlock } from "../lib/hotels-monde/booking-guard"

test("Hôtels Monde : le serveur bloque les réservations tant que le fournisseur est simulé", () => {
  const block = getWorldHotelBookingBlock()
  assert.ok(block)
  assert.equal(block.code, "DEMO_SUPPLIER_BOOKING_DISABLED")
  assert.match(block.message, /offres de démonstration/i)
  assert.match(block.message, /temporairement indisponible/i)
})
