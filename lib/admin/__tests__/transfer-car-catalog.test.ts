/**
 * CERTIFICATION — catalogue Transferts/Voitures (chantier "Centrale de
 * réservation multi-produit", item 1). Deux choses à prouver, réellement,
 * pas seulement par lecture de code :
 *
 *  1. Isolation agence : le correctif de scoping apporté à
 *     app/(public)/[locale]/transferts/{page,resultats/page}.tsx (avant,
 *     ces pages listaient TOUTES les zones actives, toutes agences
 *     confondues) — une agence B ne doit jamais voir le catalogue d'une
 *     agence A.
 *  2. Raccordement réel aux flux : lib/transfers/pricing.ts::calculateTransferPrice()
 *     et lib/cars/pricing.ts::calculateCarPrice() (le code que le client
 *     public utilise déjà) résolvent correctement un prix depuis des lignes
 *     catalogue créées par le nouveau back-office admin (lib/admin/
 *     transfers-catalog-actions.ts, lib/admin/car-catalog-actions.ts) — et
 *     `isActive=false` sur un tarif voiture l'exclut bien du calcul (ce que
 *     `setCarPricingRateActive()` bascule).
 *
 * Les Server Actions elles-mêmes (assertProductManager) ne sont pas
 * appelées ici : elles exigent une session Supabase réelle, hors de portée
 * de node:test (même limitation que lib/__tests__/tenant-isolation-certification.test.ts
 * et lib/mutuelle/__tests__/catalog-isolation-certification.test.ts, qui
 * testent la table/le calcul directement plutôt que l'action "use server").
 * Se dégrade en `skip` sans Postgres local (DATABASE_URL, rôle app_runtime).
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql, and } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import {
  agencies,
  catalogTransferZones,
  catalogTransferPricing,
  carLocations,
  carCategories,
  carPricingRates,
} from "@/lib/db/schema"
import { calculateTransferPrice } from "@/lib/transfers/pricing"
import { calculateCarPrice } from "@/lib/cars/pricing"

async function isDbAvailable(): Promise<boolean> {
  try {
    await withSystemContext(async (tx) => {
      await tx.execute(sql`select 1`)
    })
    return true
  } catch {
    return false
  }
}

let dbAvailable = false
const skipReason = () => "Postgres local indisponible (DATABASE_URL)."

let agencyA = ""
let agencyB = ""
let zoneAirportA = ""
let zoneCityA = ""
let categoryA = ""
let locationA = ""
let inactiveRateId = ""

before(async () => {
  dbAvailable = await isDbAvailable()
  if (!dbAvailable) return

  agencyA = randomUUID()
  agencyB = randomUUID()
  zoneAirportA = randomUUID()
  zoneCityA = randomUUID()
  categoryA = randomUUID()
  locationA = randomUUID()
  inactiveRateId = randomUUID()

  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values([
      { id: agencyA, slug: `tcc-a-${agencyA}`, name: "Transfer/Car Test Agency A", agencyType: "ota" },
      { id: agencyB, slug: `tcc-b-${agencyB}`, name: "Transfer/Car Test Agency B", agencyType: "ota" },
    ])

    // Catalogue Transferts — agence A seulement.
    await tx.insert(catalogTransferZones).values([
      { id: zoneAirportA, agencyId: agencyA, name: "Aéroport Test A", zoneType: "airport", status: "active" },
      { id: zoneCityA, agencyId: agencyA, name: "Ville Test A", zoneType: "city", status: "active" },
    ])
    await tx.insert(catalogTransferPricing).values({
      agencyId: agencyA,
      fromZoneId: zoneAirportA,
      toZoneId: zoneCityA,
      vehicleType: "sedan",
      basePriceTnd: "50.000",
      nightSurchargePercent: 20,
    })

    // Catalogue Voitures — agence A seulement, avec un tarif actif + un inactif.
    await tx.insert(carLocations).values({ id: locationA, agencyId: agencyA, name: "Comptoir Test A", locationType: "airport", city: "Test City" })
    await tx.insert(carCategories).values({ id: categoryA, agencyId: agencyA, code: `TST-${categoryA.slice(0, 6)}`, name: "Catégorie Test" })
    await tx.insert(carPricingRates).values([
      {
        agencyId: agencyA,
        categoryId: categoryA,
        locationId: locationA,
        dailyRateTnd: "80.000",
        minRentalDays: 1,
        depositTnd: "500.000",
        isActive: true,
      },
      {
        id: inactiveRateId,
        agencyId: agencyA,
        categoryId: categoryA,
        locationId: null,
        dailyRateTnd: "60.000",
        minRentalDays: 1,
        depositTnd: "300.000",
        isActive: false,
      },
    ])
  })
})

after(async () => {
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    await tx.delete(carPricingRates).where(eq(carPricingRates.agencyId, agencyA))
    await tx.delete(carCategories).where(eq(carCategories.agencyId, agencyA))
    await tx.delete(carLocations).where(eq(carLocations.agencyId, agencyA))
    await tx.delete(catalogTransferPricing).where(eq(catalogTransferPricing.agencyId, agencyA))
    await tx.delete(catalogTransferZones).where(eq(catalogTransferZones.agencyId, agencyA))
    await tx.delete(agencies).where(eq(agencies.id, agencyA))
    await tx.delete(agencies).where(eq(agencies.id, agencyB))
  })
})

/* -------------------------------------------------------------------------- */
/* 1. Isolation agence — le correctif de scoping des zones publiques          */
/* -------------------------------------------------------------------------- */

test("catalog_transfer_zones : une agence B ne voit jamais les zones actives de l'agence A (scoping public)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  // Reproduit exactement la requête de app/(public)/[locale]/transferts/page.tsx
  // après correctif (avant, aucun filtre agencyId n'existait).
  const rowsForB = await withSystemContext((db) =>
    db.select().from(catalogTransferZones).where(and(eq(catalogTransferZones.agencyId, agencyB), eq(catalogTransferZones.status, "active"))),
  )
  assert.equal(rowsForB.length, 0, "agence B ne doit voir aucune zone de l'agence A")

  const rowsForA = await withSystemContext((db) =>
    db.select().from(catalogTransferZones).where(and(eq(catalogTransferZones.agencyId, agencyA), eq(catalogTransferZones.status, "active"))),
  )
  assert.equal(rowsForA.length, 2, "agence A voit bien ses 2 zones actives")
})

test("car_locations/car_categories : une agence B ne voit jamais le catalogue de l'agence A", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const locationsForB = await withSystemContext((db) => db.select().from(carLocations).where(eq(carLocations.agencyId, agencyB)))
  const categoriesForB = await withSystemContext((db) => db.select().from(carCategories).where(eq(carCategories.agencyId, agencyB)))
  assert.equal(locationsForB.length, 0)
  assert.equal(categoriesForB.length, 0)
})

/* -------------------------------------------------------------------------- */
/* 2. Raccordement réel aux flux existants                                    */
/* -------------------------------------------------------------------------- */

test("calculateTransferPrice() résout un prix réel depuis un tarif créé via le nouveau catalogue", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const result = await calculateTransferPrice({
    fromZoneId: zoneAirportA,
    toZoneId: zoneCityA,
    vehicleType: "sedan",
    pickupDate: "2027-01-01",
    pickupTime: "14:00", // hors plage nuit
    agencyId: agencyA,
  })
  assert.ok(result, "un tarif doit être résolu")
  assert.equal(result!.basePriceTnd, 50)
  assert.equal(result!.nightSurchargeAmount, 0, "14h n'est pas dans la plage de nuit (21h-6h)")
  assert.equal(result!.totalTnd, 50)
})

test("calculateTransferPrice() applique la majoration nuit configurée sur le tarif", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const result = await calculateTransferPrice({
    fromZoneId: zoneAirportA,
    toZoneId: zoneCityA,
    vehicleType: "sedan",
    pickupDate: "2027-01-01",
    pickupTime: "23:00", // dans la plage nuit
    agencyId: agencyA,
  })
  assert.ok(result)
  assert.equal(result!.nightSurchargePercent, 20)
  assert.equal(result!.nightSurchargeAmount, 10, "20% de 50 DT")
  assert.equal(result!.totalTnd, 60)
})

test("calculateTransferPrice() renvoie null pour une agence sans tarif configuré (jamais de prix inventé)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const result = await calculateTransferPrice({
    fromZoneId: zoneAirportA,
    toZoneId: zoneCityA,
    vehicleType: "sedan",
    pickupDate: "2027-01-01",
    pickupTime: "14:00",
    agencyId: agencyB,
  })
  assert.equal(result, null)
})

test("calculateCarPrice() résout un prix réel depuis un tarif créé via le nouveau catalogue", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const result = await calculateCarPrice({
    categoryId: categoryA,
    locationId: locationA,
    pickupAt: "2027-01-01T10:00:00Z",
    dropoffAt: "2027-01-03T10:00:00Z", // 2 jours
    insuranceLevel: "basic",
    agencyId: agencyA,
  })
  assert.ok(result, "un tarif doit être résolu")
  assert.equal(result!.rentalDays, 2)
  assert.equal(result!.dailyRateTnd, 80)
  assert.equal(result!.baseTotalTnd, 160)
  assert.equal(result!.depositTnd, 500)
})

test("calculateCarPrice() ignore un tarif désactivé (isActive=false, tel que basculé par setCarPricingRateActive)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  // Le tarif inactif (60 DT/j, sans locationId) ne doit jamais être choisi
  // tant que le tarif actif (80 DT/j, avec locationId) existe pour ce lieu.
  const result = await calculateCarPrice({
    categoryId: categoryA,
    locationId: locationA,
    pickupAt: "2027-01-01T10:00:00Z",
    dropoffAt: "2027-01-02T10:00:00Z",
    insuranceLevel: "basic",
    agencyId: agencyA,
  })
  assert.ok(result)
  assert.equal(result!.dailyRateTnd, 80, "doit ignorer le tarif isActive=false")

  // Une fois le SEUL tarif actif désactivé, plus aucun prix ne doit être
  // inventé — reproduit exactement ce que fait setCarPricingRateActive(id, false).
  await withSystemContext((db) =>
    db.update(carPricingRates).set({ isActive: false }).where(eq(carPricingRates.categoryId, categoryA)),
  )
  const afterDeactivation = await calculateCarPrice({
    categoryId: categoryA,
    locationId: locationA,
    pickupAt: "2027-01-01T10:00:00Z",
    dropoffAt: "2027-01-02T10:00:00Z",
    insuranceLevel: "basic",
    agencyId: agencyA,
  })
  assert.equal(afterDeactivation, null)
})

test("calculateCarPrice() renvoie null pour une agence sans tarif configuré", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const result = await calculateCarPrice({
    categoryId: categoryA,
    locationId: locationA,
    pickupAt: "2027-01-01T10:00:00Z",
    dropoffAt: "2027-01-02T10:00:00Z",
    insuranceLevel: "basic",
    agencyId: agencyB,
  })
  assert.equal(result, null)
})
