import test from "node:test"
import assert from "node:assert/strict"

import { omraGuestBookingSchema } from "../schemas"

const validPilgrim = {
  firstName: "Ahmed",
  lastName: "Ben Ali",
  birthDate: "1980-05-12",
  nationality: "TN",
  gender: "male" as const,
  maritalStatus: "married" as const,
  phone: "+216 98 123 456",
  email: "ahmed@example.tn",
  country: "TN",
  passportNumber: "A12345678",
  passportIssueDate: "2020-01-01",
  passportExpiryDate: "2030-01-01",
  passportIssuingCountry: "TN",
}

const validBooking = {
  packageId: "11111111-1111-1111-1111-111111111111",
  departureDate: "2026-03-01",
  pilgrims: [validPilgrim],
}

test("omraGuestBookingSchema : accepte une réservation valide avec contact principal", () => {
  const result = omraGuestBookingSchema.safeParse(validBooking)
  assert.equal(result.success, true)
})

test("omraGuestBookingSchema : refuse si le premier pèlerin n'a pas d'email (contact du groupe requis)", () => {
  const result = omraGuestBookingSchema.safeParse({
    ...validBooking,
    pilgrims: [{ ...validPilgrim, email: "" }],
  })
  assert.equal(result.success, false)
  if (!result.success) {
    assert.ok(result.error.errors.some((e) => e.path.join(".") === "pilgrims.0.email"))
  }
})

test("omraGuestBookingSchema : accepte l'absence d'email pour un pèlerin secondaire", () => {
  const result = omraGuestBookingSchema.safeParse({
    ...validBooking,
    pilgrims: [validPilgrim, { ...validPilgrim, email: "", firstName: "Fatma" }],
  })
  assert.equal(result.success, true)
})

test("omraGuestBookingSchema : refuse un packageId qui n'est pas un UUID", () => {
  const result = omraGuestBookingSchema.safeParse({ ...validBooking, packageId: "not-a-uuid" })
  assert.equal(result.success, false)
})

test("omraGuestBookingSchema : refuse une liste de pèlerins vide", () => {
  const result = omraGuestBookingSchema.safeParse({ ...validBooking, pilgrims: [] })
  assert.equal(result.success, false)
})

test("omraGuestBookingSchema : refuse plus de 100 pèlerins", () => {
  const pilgrims = Array.from({ length: 101 }, (_, i) => ({
    ...validPilgrim,
    email: i === 0 ? validPilgrim.email : "",
  }))
  const result = omraGuestBookingSchema.safeParse({ ...validBooking, pilgrims })
  assert.equal(result.success, false)
})

test("omraGuestBookingSchema : refuse un numéro de passeport trop court", () => {
  const result = omraGuestBookingSchema.safeParse({
    ...validBooking,
    pilgrims: [{ ...validPilgrim, passportNumber: "A1" }],
  })
  assert.equal(result.success, false)
})

test("omraGuestBookingSchema : refuse un code pays de nationalité invalide", () => {
  const result = omraGuestBookingSchema.safeParse({
    ...validBooking,
    pilgrims: [{ ...validPilgrim, nationality: "Tunisia" }],
  })
  assert.equal(result.success, false)
})
