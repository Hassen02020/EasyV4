import test from "node:test"
import assert from "node:assert/strict"
import {
  travelerSchema,
  travelerSchemaWithIdRule,
  bookingDraftSchema,
  checkoutSchema,
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

test("travelerSchema: voyageur valide passe", () => {
  const r = travelerSchema.safeParse(validTraveler)
  assert.equal(r.success, true)
})

test("travelerSchema: email invalide rejeté", () => {
  const r = travelerSchema.safeParse({ ...validTraveler, email: "abc" })
  assert.equal(r.success, false)
})

test("travelerSchema: prénom trop court rejeté", () => {
  const r = travelerSchema.safeParse({ ...validTraveler, firstName: "H" })
  assert.equal(r.success, false)
})

test("travelerSchema: téléphone invalide rejeté", () => {
  const r = travelerSchema.safeParse({ ...validTraveler, phone: "abc" })
  assert.equal(r.success, false)
})

test("travelerSchemaWithIdRule: CIN 8 chiffres OK", () => {
  const r = travelerSchemaWithIdRule.safeParse(validTraveler)
  assert.equal(r.success, true)
})

test("travelerSchemaWithIdRule: CIN 7 chiffres rejeté", () => {
  const r = travelerSchemaWithIdRule.safeParse({
    ...validTraveler,
    civicId: "1234567",
  })
  assert.equal(r.success, false)
})

test("travelerSchemaWithIdRule: passport accepte format libre", () => {
  const r = travelerSchemaWithIdRule.safeParse({
    ...validTraveler,
    civicIdType: "passport",
    civicId: "AB1234567",
  })
  assert.equal(r.success, true)
})

test("bookingDraftSchema: brouillon hotel valide", () => {
  const r = bookingDraftSchema.safeParse({
    module: "hotel",
    offerId: "102",
    offerLabel: "Iberostar Selection Diar El Andalous",
    startDate: "2026-06-15",
    endDate: "2026-06-22",
    adults: 2,
    children: 1,
    unitPriceTnd: 350,
    currency: "TND",
  })
  assert.equal(r.success, true)
  if (r.success) {
    assert.equal(r.data.module, "hotel")
    assert.equal(r.data.adults, 2)
  }
})

test("bookingDraftSchema: module inconnu rejeté", () => {
  const r = bookingDraftSchema.safeParse({
    module: "spaceship",
    offerId: "1",
    offerLabel: "x",
    startDate: "2026-06-15",
    adults: 1,
    unitPriceTnd: 1,
  })
  assert.equal(r.success, false)
})

test("bookingDraftSchema: dates mauvais format rejeté", () => {
  const r = bookingDraftSchema.safeParse({
    module: "hotel",
    offerId: "1",
    offerLabel: "x",
    startDate: "15/06/2026",
    adults: 1,
    unitPriceTnd: 100,
  })
  assert.equal(r.success, false)
})

test("checkoutSchema: CGV non cochées rejeté", () => {
  const r = checkoutSchema.safeParse({
    paymentMethod: "card",
    acceptCgv: false,
  })
  assert.equal(r.success, false)
})

test("checkoutSchema: CGV cochées OK", () => {
  const r = checkoutSchema.safeParse({
    paymentMethod: "card",
    acceptCgv: true,
  })
  assert.equal(r.success, true)
})
