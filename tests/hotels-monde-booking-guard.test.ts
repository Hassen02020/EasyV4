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

test("Hôtels Monde : l'action serveur appelle le garde-fou avant DATABASE_URL, idempotence, fournisseur, paiement et écriture DB", async () => {
  const { readFileSync } = await import("node:fs")
  const src = readFileSync(
    new URL("../lib/hotels-monde/guest-booking-actions.ts", import.meta.url),
    "utf8",
  )
  const fn = src.slice(
    src.indexOf("export async function createGuestWorldHotelBooking"),
  )
  const guard = fn.indexOf("getWorldHotelBookingBlock()")
  assert.ok(guard > 0)
  for (const marker of [
    "process.env.DATABASE_URL",
    "withGuestIdempotency",
    "bookWorldHotel(",
    "acquireLock(",
    "db.",
  ]) {
    const pos = fn.indexOf(marker)
    if (pos !== -1) assert.ok(guard < pos, `garde-fou doit précéder ${marker}`)
  }
  assert.match(fn, /code: bookingBlock\.code/)
})
