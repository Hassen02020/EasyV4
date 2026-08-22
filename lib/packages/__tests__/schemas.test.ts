import test from "node:test"
import assert from "node:assert/strict"

import { packageGuestBookingSchema } from "../schemas"

const validTraveler = {
  civility: "M" as const,
  firstName: "Hassen",
  lastName: "Tarhouni",
  email: "hassen@example.tn",
  phone: "+216 98 140 514",
  civicIdType: "cin" as const,
  civicId: "12345678",
}

const validBooking = {
  packageId: "11111111-1111-1111-1111-111111111111",
  departureId: "22222222-2222-2222-2222-222222222222",
  adults: 2,
  children: 0,
  childrenAges: [] as number[],
  traveler: validTraveler,
}

test("packageGuestBookingSchema : accepte une réservation valide sans enfant", () => {
  const result = packageGuestBookingSchema.safeParse(validBooking)
  assert.equal(result.success, true)
})

test("packageGuestBookingSchema : accepte une réservation avec enfants et âges correspondants", () => {
  const result = packageGuestBookingSchema.safeParse({
    ...validBooking,
    children: 2,
    childrenAges: [5, 8],
  })
  assert.equal(result.success, true)
})

test("packageGuestBookingSchema : refuse si le nombre d'âges d'enfants ne correspond pas au nombre d'enfants", () => {
  const result = packageGuestBookingSchema.safeParse({
    ...validBooking,
    children: 2,
    childrenAges: [5],
  })
  assert.equal(result.success, false)
  if (!result.success) {
    assert.ok(result.error.errors.some((e) => e.path.join(".") === "childrenAges"))
  }
})

test("packageGuestBookingSchema : refuse un packageId qui n'est pas un UUID", () => {
  const result = packageGuestBookingSchema.safeParse({ ...validBooking, packageId: "not-a-uuid" })
  assert.equal(result.success, false)
})

test("packageGuestBookingSchema : refuse un départureId qui n'est pas un UUID", () => {
  const result = packageGuestBookingSchema.safeParse({ ...validBooking, departureId: "not-a-uuid" })
  assert.equal(result.success, false)
})

test("packageGuestBookingSchema : refuse zéro adulte", () => {
  const result = packageGuestBookingSchema.safeParse({ ...validBooking, adults: 0 })
  assert.equal(result.success, false)
})

test("packageGuestBookingSchema : refuse un traveler invalide (email manquant)", () => {
  const result = packageGuestBookingSchema.safeParse({
    ...validBooking,
    traveler: { ...validTraveler, email: "" },
  })
  assert.equal(result.success, false)
})
