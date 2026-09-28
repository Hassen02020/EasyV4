/**
 * Pure unit tests for mapFlightStatusToReservation.
 * No DB, no server-only imports — runs with node:test + tsx.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { mapFlightStatusToReservation } from "@/lib/vols/flight-status-utils"

test("PENDING maps to pending", () => {
  assert.equal(mapFlightStatusToReservation("PENDING"), "pending")
})

test("PRICE_RECHECK maps to pending", () => {
  assert.equal(mapFlightStatusToReservation("PRICE_RECHECK"), "pending")
})

test("PRICE_CHANGED maps to pending", () => {
  assert.equal(mapFlightStatusToReservation("PRICE_CHANGED"), "pending")
})

test("APPROVED maps to on_request", () => {
  assert.equal(mapFlightStatusToReservation("APPROVED"), "on_request")
})

test("BOOKING_IN_PROGRESS maps to on_request", () => {
  assert.equal(mapFlightStatusToReservation("BOOKING_IN_PROGRESS"), "on_request")
})

test("BOOKED maps to on_request", () => {
  assert.equal(mapFlightStatusToReservation("BOOKED"), "on_request")
})

test("TICKETING_IN_PROGRESS maps to on_request", () => {
  assert.equal(mapFlightStatusToReservation("TICKETING_IN_PROGRESS"), "on_request")
})

test("CONFIRMED maps to confirmed", () => {
  assert.equal(mapFlightStatusToReservation("CONFIRMED"), "confirmed")
})

test("FAILED maps to cancelled", () => {
  assert.equal(mapFlightStatusToReservation("FAILED"), "cancelled")
})

test("CANCELLED maps to cancelled", () => {
  assert.equal(mapFlightStatusToReservation("CANCELLED"), "cancelled")
})
