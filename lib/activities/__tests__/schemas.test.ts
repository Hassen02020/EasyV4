import test from "node:test"
import assert from "node:assert/strict"

import {
  activityGuestBookingSchema,
  activityPartnerBookingSchema,
  validateChildAgesAgainstTariffRules,
} from "../schemas"

const validTraveler = {
  civility: "M" as const,
  firstName: "Hassen",
  lastName: "Tarhouni",
  email: "hassen@example.tn",
  phone: "+216 98 140 514",
  civicIdType: "cin" as const,
  civicId: "12345678",
}

const validGuestBooking = {
  activityId: "11111111-1111-1111-1111-111111111111",
  sessionId: "22222222-2222-2222-2222-222222222222",
  adults: 2,
  children: 0,
  childrenAges: [] as number[],
  traveler: validTraveler,
}

test("activityGuestBookingSchema : accepte une réservation valide sans enfant", () => {
  const result = activityGuestBookingSchema.safeParse(validGuestBooking)
  assert.equal(result.success, true)
})

test("activityGuestBookingSchema : accepte une réservation avec enfants et âges correspondants", () => {
  const result = activityGuestBookingSchema.safeParse({
    ...validGuestBooking,
    children: 2,
    childrenAges: [5, 8],
  })
  assert.equal(result.success, true)
})

test("activityGuestBookingSchema : refuse si le nombre d'âges d'enfants ne correspond pas", () => {
  const result = activityGuestBookingSchema.safeParse({
    ...validGuestBooking,
    children: 2,
    childrenAges: [5],
  })
  assert.equal(result.success, false)
})

test("activityGuestBookingSchema : refuse zéro adulte", () => {
  const result = activityGuestBookingSchema.safeParse({ ...validGuestBooking, adults: 0 })
  assert.equal(result.success, false)
})

test("activityGuestBookingSchema : refuse un activityId non-UUID", () => {
  const result = activityGuestBookingSchema.safeParse({ ...validGuestBooking, activityId: "not-a-uuid" })
  assert.equal(result.success, false)
})

const validPartnerBooking = {
  activityId: "11111111-1111-1111-1111-111111111111",
  sessionId: "22222222-2222-2222-2222-222222222222",
  adults: 3,
  children: 1,
  childrenAges: [10],
  customerFirstName: "Ahmed",
  customerLastName: "Ben Salah",
  customerPhone: "+216 22 333 444",
}

test("activityPartnerBookingSchema : accepte une réservation B2B valide", () => {
  const result = activityPartnerBookingSchema.safeParse(validPartnerBooking)
  assert.equal(result.success, true)
})

test("activityPartnerBookingSchema : n'exige pas d'email (contact B2B simplifié)", () => {
  const result = activityPartnerBookingSchema.safeParse({ ...validPartnerBooking, customerEmail: "" })
  assert.equal(result.success, true)
})

test("activityPartnerBookingSchema : refuse un email malformé si fourni", () => {
  const result = activityPartnerBookingSchema.safeParse({ ...validPartnerBooking, customerEmail: "not-an-email" })
  assert.equal(result.success, false)
})

test("activityPartnerBookingSchema : refuse un téléphone client manquant", () => {
  const result = activityPartnerBookingSchema.safeParse({ ...validPartnerBooking, customerPhone: "" })
  assert.equal(result.success, false)
})

// --- validateChildAgesAgainstTariffRules ---

test("validateChildAgesAgainstTariffRules : ne rejette rien si tariffRules est absent", () => {
  assert.equal(validateChildAgesAgainstTariffRules(null, [10, 15]), null)
  assert.equal(validateChildAgesAgainstTariffRules(undefined, [10]), null)
})

test("validateChildAgesAgainstTariffRules : ne rejette rien si childMaxAge n'est pas défini", () => {
  assert.equal(validateChildAgesAgainstTariffRules({ note: "libre" }, [10, 16]), null)
})

test("validateChildAgesAgainstTariffRules : accepte des âges sous la limite childMaxAge", () => {
  assert.equal(validateChildAgesAgainstTariffRules({ childMaxAge: 12 }, [5, 10, 12]), null)
})

test("validateChildAgesAgainstTariffRules : rejette un âge au-dessus de childMaxAge", () => {
  const result = validateChildAgesAgainstTariffRules({ childMaxAge: 12 }, [5, 13])
  assert.notEqual(result, null)
  assert.match(result ?? "", /12/)
})
