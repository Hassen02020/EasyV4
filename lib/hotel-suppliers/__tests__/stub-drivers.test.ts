import test from "node:test"
import assert from "node:assert/strict"
import { createTunisiaBedDriver } from "../tunisia-bed/driver"
import { createCyberesaDriver } from "../cyberesa/driver"
import { createThreeTDriver } from "../3t/driver"
import type { HotelSupplierDriver } from "../core/supplier"

const REQUEST = {
  destinationId: "1",
  checkIn: "2026-09-10",
  checkOut: "2026-09-13",
  rooms: [{ adults: 2 }],
  currency: "TND",
}

async function assertHonestlyNotConfigured(driver: HotelSupplierDriver) {
  assert.equal(driver.getConfigStatus(), "NOT_CONFIGURED")
  await assert.rejects(() => driver.search(REQUEST))
  const checkRate = await driver.checkRate({
    supplier: driver.supplier,
    supplierHotelCode: "x",
    supplierRateCode: "x",
    roomId: "x",
    checkIn: REQUEST.checkIn,
    checkOut: REQUEST.checkOut,
    rooms: REQUEST.rooms,
    currency: "TND",
  })
  assert.equal(checkRate.ok, false)
  if (!checkRate.ok) assert.equal(checkRate.code, "NOT_CONFIGURED")

  const book = await driver.book({
    supplier: driver.supplier,
    supplierHotelCode: "x",
    supplierRateCode: "x",
    roomId: "x",
    checkIn: REQUEST.checkIn,
    checkOut: REQUEST.checkOut,
    currency: "TND",
    expectedNetPrice: 100,
    travelers: [],
    correlationId: "test",
  })
  assert.equal(book.outcome, "DEFINITIVE_FAILURE")
  if (book.outcome === "DEFINITIVE_FAILURE") assert.equal(book.code, "NOT_CONFIGURED")

  const cancel = await driver.cancel({ supplier: driver.supplier, supplierBookingReference: "x" })
  assert.equal(cancel.ok, false)
  if (!cancel.ok) assert.equal(cancel.code, "NOT_CONFIGURED")

  const reconcile = await driver.reconcileBooking({
    supplier: driver.supplier,
    supplierHotelCode: "x",
    checkIn: REQUEST.checkIn,
    checkOut: REQUEST.checkOut,
  })
  assert.equal(reconcile.outcome, "UNSUPPORTED")
}

test("Tunisia Bed : honnêtement NOT_CONFIGURED sur toutes les opérations, aucun résultat fabriqué", async () => {
  await assertHonestlyNotConfigured(createTunisiaBedDriver())
})

test("Cyberesa : honnêtement NOT_CONFIGURED sur toutes les opérations, aucun résultat fabriqué", async () => {
  await assertHonestlyNotConfigured(createCyberesaDriver())
})

test("3T : honnêtement NOT_CONFIGURED sur toutes les opérations, aucun résultat fabriqué", async () => {
  await assertHonestlyNotConfigured(createThreeTDriver())
})
