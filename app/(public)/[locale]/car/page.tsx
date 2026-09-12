/**
 * Page Location de voiture — /car
 *
 * Server Component : charge le catalogue réel (lieux + catégories) de la
 * flotte Easy2Book — même pattern que app/transferts/page.tsx. Le module
 * Car (lib/db/schema/cars.ts) modélise un catalogue PAR AGENCE (chaque
 * table porte `agency_id`) ; pour la vitrine publique B2C, on résout
 * l'agence "OTA directe" (`getDefaultAgencyId`, agency_type='ota') qui
 * représente Easy2Book elle-même et sa flotte propre — décision produit
 * validée (vitrine publique = flotte Easy2Book, pas un marketplace
 * multi-agences pour l'instant).
 *
 * Avant cette page, `CarSearch` utilisait une liste de lieux/catégories
 * codée en dur (`LOCATIONS`/`CATEGORIES`) qui ne correspondait à aucune
 * ligne réelle de `car_locations`/`car_categories` — la recherche menait
 * de toute façon à un 404 (`/car/search` n'existait pas), donc ce n'était
 * jamais remarqué. Corrigé en même temps que l'ajout de la results layer.
 */

import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { CarSearch } from "@/components/car/car-search"
import { withSystemContext } from "@/lib/db/tenant-context"
import { carLocations, carCategories } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Location de Voiture | Easy2Book",
  description:
    "Louez une voiture en Tunisie au meilleur prix. Berline, SUV, minibus. Prise en charge aéroport ou agence.",
}

async function getCatalog() {
  try {
    const agencyId = await getDefaultAgencyId()
    if (!agencyId) return { agencyId: null, locations: [], categories: [] }

    // Catalogue public (trafic anonyme, pas de session storefront).
    const [locations, categories] = await Promise.all([
      withSystemContext((db) =>
        db
          .select()
          .from(carLocations)
          .where(and(eq(carLocations.agencyId, agencyId), eq(carLocations.status, "active")))
          .orderBy(carLocations.name),
      ),
      withSystemContext((db) =>
        db
          .select()
          .from(carCategories)
          .where(and(eq(carCategories.agencyId, agencyId), eq(carCategories.status, "active")))
          .orderBy(carCategories.name),
      ),
    ])
    return { agencyId, locations, categories }
  } catch {
    return { agencyId: null, locations: [], categories: [] }
  }
}

interface CarSearchParams {
  location?: string
  pickupDate?: string
  returnDate?: string
  category?: string
}

export default async function CarPage({
  searchParams,
}: {
  searchParams: Promise<CarSearchParams>
}) {
  const { location, pickupDate, returnDate, category } = await searchParams
  const { locations, categories } = await getCatalog()

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 bg-muted/30">
        <div className="bg-gradient-to-br from-orange-900 to-orange-700 px-4 py-12 text-white">
          <div className="mx-auto max-w-4xl text-center">
            <p className="mb-2 text-sm font-medium tracking-widest text-orange-300 uppercase">
              Location de Voiture
            </p>
            <h1 className="mb-4 text-3xl font-bold md:text-4xl">
              Louez votre voiture
            </h1>
            <p className="mx-auto max-w-2xl text-orange-100">
              Flotte récente, assurance incluse. Prise en charge aéroport,
              agences dans toute la Tunisie.
            </p>
          </div>
        </div>
        <div className="mx-auto max-w-4xl px-4 py-10">
          <CarSearch
            locations={locations}
            categories={categories}
            initialLocation={location}
            initialPickupDate={pickupDate}
            initialReturnDate={returnDate}
            initialCategory={category}
          />
        </div>
      </main>
      <Footer />
    </div>
  )
}
