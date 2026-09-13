/**
 * PHASE PREMIUM 2 — Chantier 4 (Pages Destination + SEO).
 *
 * Teste `lib/destinations/queries.ts` contre le seed réel (0055) + le
 * backfill `seo_description` (0056) — pas de fixtures inventées, même
 * discipline que `destinations-search-route.test.ts` (chantier 3) :
 * dégradation propre (tous les tests `skip`) si aucune base n'est
 * joignable.
 */
import test, { before } from "node:test"
import assert from "node:assert/strict"
import { sql } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import {
  destinationLinkHref,
  getDestinationBySlug,
  listActiveCountriesWithCities,
  listActiveDestinationSlugs,
  localizedDestinationName,
} from "@/lib/destinations/queries"

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
const skipReason = () =>
  "Postgres local indisponible (DATABASE_URL) — appliquer drizzle/manual/0055 + 0056 sur un mirroir local pour exécuter ces tests."

before(async () => {
  dbAvailable = await isDbAvailable()
})

test("1. listActiveDestinationSlugs renvoie les 28 slugs du seed, dont istanbul et tunisie", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const slugs = await listActiveDestinationSlugs()
  assert.equal(slugs.length, 28)
  assert.ok(slugs.includes("istanbul"))
  assert.ok(slugs.includes("tunisie"))
})

test("2. listActiveCountriesWithCities regroupe les villes sous leur pays (Turquie -> Istanbul)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const countries = await listActiveCountriesWithCities()
  assert.equal(countries.length, 11)
  const turkey = countries.find((c) => c.slug === "turquie")
  assert.ok(turkey)
  assert.ok(turkey!.cities.some((c) => c.slug === "istanbul"))
})

test("3. getDestinationBySlug('istanbul') — fiche ville : parent Turquie + refs externes (hotels_monde/packages/iata), pas mygo_city", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const detail = await getDestinationBySlug("istanbul")
  assert.ok(detail)
  assert.equal(detail!.destination.type, "city")
  assert.equal(detail!.parent?.slug, "turquie")
  assert.equal(detail!.children.length, 0)
  assert.ok(detail!.externalRefs.some((r) => r.module === "hotels_monde_slug"))
  assert.ok(!detail!.externalRefs.some((r) => (r.module as string) === "mygo_city"))
})

test("4. getDestinationBySlug('turquie') — fiche pays : pas de parent, Istanbul en enfant, aucune ref externe", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const detail = await getDestinationBySlug("turquie")
  assert.ok(detail)
  assert.equal(detail!.destination.type, "country")
  assert.equal(detail!.parent, null)
  assert.ok(detail!.children.some((c) => c.slug === "istanbul"))
  assert.equal(detail!.externalRefs.length, 0)
})

test("5. getDestinationBySlug — slug inconnu renvoie null (pas de fabrication)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const detail = await getDestinationBySlug("atlantide")
  assert.equal(detail, null)
})

test("6. localizedDestinationName replie sur le français si name_en/name_ar absent", () => {
  const dest = { name: "Tunis", nameEn: null, nameAr: "مدينة تونس" }
  assert.equal(localizedDestinationName(dest, "fr"), "Tunis")
  assert.equal(localizedDestinationName(dest, "en"), "Tunis")
  assert.equal(localizedDestinationName(dest, "ar"), "مدينة تونس")
})

test("7. destinationLinkHref construit le lien de recherche pré-rempli par module", () => {
  assert.equal(destinationLinkHref("hotels_monde_slug", "istanbul"), "/hotels-monde?destination=istanbul")
  assert.equal(destinationLinkHref("packages_slug", "casablanca"), "/packages?destination=casablanca")
  assert.equal(destinationLinkHref("iata", "CDG"), "/vols?destination=CDG")
})
