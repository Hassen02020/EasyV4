import test from "node:test"
import assert from "node:assert/strict"

import { isVoucherEligible } from "../voucher-eligibility"

const baseHotelRow = {
  module: "hotel",
  hotelName: "Yocca Hotel Residence",
  checkIn: "2026-09-10",
  checkOut: "2026-09-13",
}

test("isVoucherEligible : true pour une réservation hôtel confirmée", () => {
  assert.equal(isVoucherEligible({ ...baseHotelRow, status: "confirmed" }), true)
})

test("isVoucherEligible : true pour un séjour terminé (completed)", () => {
  assert.equal(isVoucherEligible({ ...baseHotelRow, status: "completed" }), true)
})

test("isVoucherEligible : false pour une réservation encore pending (pas de faux voucher)", () => {
  assert.equal(isVoucherEligible({ ...baseHotelRow, status: "pending" }), false)
})

test("isVoucherEligible : false pour une réservation on_request", () => {
  assert.equal(isVoucherEligible({ ...baseHotelRow, status: "on_request" }), false)
})

test("isVoucherEligible : false pour une réservation annulée", () => {
  assert.equal(isVoucherEligible({ ...baseHotelRow, status: "cancelled" }), false)
})

test("isVoucherEligible : false pour une réservation remboursée", () => {
  assert.equal(isVoucherEligible({ ...baseHotelRow, status: "refunded" }), false)
})

test("isVoucherEligible : false pour un module non-hôtel même confirmé", () => {
  assert.equal(
    isVoucherEligible({ module: "transfer", status: "confirmed", hotelName: null, checkIn: null, checkOut: null }),
    false,
  )
})

test("isVoucherEligible : false si les données de séjour sont incomplètes", () => {
  assert.equal(
    isVoucherEligible({ module: "hotel", status: "confirmed", hotelName: null, checkIn: "2026-09-10", checkOut: "2026-09-13" }),
    false,
  )
})
