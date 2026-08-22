import test from "node:test"
import assert from "node:assert/strict"

import { PRODUCT_STATUSES, isValidProductStatus, PRODUCT_CHANNELS } from "../product-constants"
import { packageProductSchema, packageDepartureSchema } from "../schemas/package-product"
import { omraProductSchema, omraDepartureSchema, omraProductMetadataSchema } from "../schemas/omra-product"
import { activityProductSchema, activitySessionSchema } from "../schemas/activity-product"

/* -------------------------------------------------------------------------- */
/* product-guard                                                              */
/* -------------------------------------------------------------------------- */

test("PRODUCT_STATUSES : exactement le vocabulaire demandé par la mission Phase 13", () => {
  assert.deepEqual([...PRODUCT_STATUSES], ["draft", "published", "suspended", "archived"])
})

test("isValidProductStatus : accepte les 4 statuts valides", () => {
  for (const s of PRODUCT_STATUSES) assert.equal(isValidProductStatus(s), true)
})

test("isValidProductStatus : refuse un statut inconnu (ex: 'active', l'ancien vocabulaire)", () => {
  assert.equal(isValidProductStatus("active"), false)
  assert.equal(isValidProductStatus("sold_out"), false)
  assert.equal(isValidProductStatus(""), false)
})

test("PRODUCT_CHANNELS : couvre B2C / B2B / marque blanche", () => {
  assert.deepEqual([...PRODUCT_CHANNELS], ["b2c", "b2b", "white_label"])
})

/* -------------------------------------------------------------------------- */
/* Packages                                                                    */
/* -------------------------------------------------------------------------- */

const validPackage = {
  code: "IST-5J",
  title: "Istanbul Découverte",
  durationDays: 5,
  durationNights: 4,
  channels: ["b2c"],
}

test("packageProductSchema : accepte un produit minimal valide", () => {
  assert.equal(packageProductSchema.safeParse(validPackage).success, true)
})

test("packageProductSchema : refuse un titre trop court", () => {
  assert.equal(packageProductSchema.safeParse({ ...validPackage, title: "AB" }).success, false)
})

test("packageProductSchema : refuse une liste de canaux vide", () => {
  assert.equal(packageProductSchema.safeParse({ ...validPackage, channels: [] }).success, false)
})

test("packageProductSchema : refuse un canal inconnu", () => {
  assert.equal(packageProductSchema.safeParse({ ...validPackage, channels: ["facebook"] }).success, false)
})

test("packageDepartureSchema : refuse une date de retour antérieure au départ", () => {
  const result = packageDepartureSchema.safeParse({
    departureDate: "2026-06-10",
    returnDate: "2026-06-05",
    adultPriceTnd: 1200,
    totalSeats: 30,
  })
  assert.equal(result.success, false)
})

test("packageDepartureSchema : accepte un départ valide", () => {
  const result = packageDepartureSchema.safeParse({
    departureDate: "2026-06-10",
    returnDate: "2026-06-15",
    adultPriceTnd: 1200,
    totalSeats: 30,
  })
  assert.equal(result.success, true)
})

test("packageDepartureSchema : refuse un prix adulte négatif ou nul", () => {
  assert.equal(
    packageDepartureSchema.safeParse({ departureDate: "2026-06-10", returnDate: "2026-06-15", adultPriceTnd: 0, totalSeats: 30 }).success,
    false,
  )
})

/* -------------------------------------------------------------------------- */
/* Omra                                                                        */
/* -------------------------------------------------------------------------- */

const validOmraMetadata = omraProductMetadataSchema.parse({})

const validOmra = {
  type: "omra" as const,
  name: "Omra Ramadan 2026",
  durationDays: 10,
  validFrom: "2026-03-01",
  validUntil: "2026-03-31",
  basePrice: 2500,
  metadata: validOmraMetadata,
  channels: ["b2c"],
}

test("omraProductMetadataSchema : construit une valeur par défaut cohérente (firstDestination='makkah')", () => {
  assert.equal(validOmraMetadata.firstDestination, "makkah")
  assert.equal(validOmraMetadata.makkah.nights, 0)
})

test("omraProductSchema : accepte un produit minimal valide", () => {
  assert.equal(omraProductSchema.safeParse(validOmra).success, true)
})

test("omraProductSchema : refuse un type de programme invalide", () => {
  assert.equal(omraProductSchema.safeParse({ ...validOmra, type: "safari" }).success, false)
})

test("omraProductSchema : refuse un prix de base non positif", () => {
  assert.equal(omraProductSchema.safeParse({ ...validOmra, basePrice: 0 }).success, false)
})

test("omraProductSchema : accepte les champs riches vol/Makkah/Médine/accompagnateur", () => {
  const result = omraProductSchema.safeParse({
    ...validOmra,
    metadata: {
      flight: { airline: "Tunisair", departureAirport: "TUN", arrivalAirport: "JED" },
      firstDestination: "madinah",
      makkah: { hotelName: "Swissotel Al Maqam", nights: 5, roomTypes: ["double"], mealPlan: "half_board" },
      madinah: { hotelName: "Dar Al Taqwa", nights: 4, roomTypes: ["double"] },
      transfers: ["airport-makkah", "makkah-madinah", "madinah-airport"],
      accompanyingPerson: { name: "Ahmed Ben Ali", phone: "+21698000000", whatsapp: "+21698000000", role: "guide" },
      otherServices: ["assurance voyage"],
    },
  })
  assert.equal(result.success, true)
  if (result.success) {
    assert.equal(result.data.metadata.firstDestination, "madinah")
    assert.equal(result.data.metadata.makkah.hotelName, "Swissotel Al Maqam")
  }
})

test("omraDepartureSchema : accepte un départ minimal", () => {
  assert.equal(omraDepartureSchema.safeParse({ departureDate: "2026-03-01", totalCapacity: 45 }).success, true)
})

test("omraDepartureSchema : refuse une capacité nulle", () => {
  assert.equal(omraDepartureSchema.safeParse({ departureDate: "2026-03-01", totalCapacity: 0 }).success, false)
})

/* -------------------------------------------------------------------------- */
/* Attractions                                                                 */
/* -------------------------------------------------------------------------- */

const validActivity = {
  code: "TAB-EXC",
  title: "Excursion Tabarka",
  durationMinutes: 480,
  channels: ["b2c"],
}

test("activityProductSchema : accepte un produit minimal valide", () => {
  assert.equal(activityProductSchema.safeParse(validActivity).success, true)
})

test("activityProductSchema : refuse une durée nulle", () => {
  assert.equal(activityProductSchema.safeParse({ ...validActivity, durationMinutes: 0 }).success, false)
})

test("activitySessionSchema : refuse une heure de fin avant l'heure de début", () => {
  const result = activitySessionSchema.safeParse({
    sessionDate: "2026-07-01",
    sessionStart: "14:00",
    sessionEnd: "09:00",
    capacity: 20,
    adultPriceTnd: 80,
  })
  assert.equal(result.success, false)
})

test("activitySessionSchema : accepte une session valide", () => {
  const result = activitySessionSchema.safeParse({
    sessionDate: "2026-07-01",
    sessionStart: "09:00",
    sessionEnd: "17:00",
    capacity: 20,
    adultPriceTnd: 80,
    childPriceTnd: 40,
  })
  assert.equal(result.success, true)
})
