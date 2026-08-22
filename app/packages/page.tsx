/**
 * Page Voyages Organisés — /packages
 * Server Component : charge les packages depuis la table catalog_packages.
 */

import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { PackageSearch } from "@/components/packages/package-search"
import { PackageList } from "@/components/packages/package-list"
import { withSystemContext } from "@/lib/db/tenant-context"
import { catalogPackageDepartures, catalogPackages } from "@/lib/db/schema"
import { and, eq, gte, ilike, inArray, sql } from "drizzle-orm"
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Voyages Organisés | Easy2Book",
  description:
    "Circuits et voyages organisés au départ de Tunisie. Istanbul, Dubaï, Paris, Rome et plus. Tout inclus.",
}

interface SearchFilters {
  destination?: string
  duration?: string
  month?: string
  travelers?: string
}

// catalog_packages n'a pas de colonne "destination" dédiée — on cherche dans
// le titre. Formes ASCII pour éviter les ratés dus aux accents (ILIKE ne
// replie pas les diacritiques).
const DESTINATION_SEARCH_TERMS: Record<string, string> = {
  istanbul: "Istanbul",
  dubai: "Dubai",
  paris: "Paris",
  rome: "Rome",
  barcelona: "Barcelone",
  london: "Londres",
  cairo: "Caire",
  casablanca: "Casablanca",
}

/** "3-5" -> [3, 5], "13+" -> [13, undefined] */
function parseDurationRange(duration: string): [number, number | undefined] | null {
  const plus = duration.match(/^(\d+)\+$/)
  if (plus) return [Number(plus[1]), undefined]
  const range = duration.match(/^(\d+)-(\d+)$/)
  if (range) return [Number(range[1]), Number(range[2])]
  return null
}

async function getActivePackages(filters: SearchFilters) {
  try {
    // Catalogue public (trafic anonyme, pas de session storefront) — scopé à
    // l'agence OTA directe, même modèle que Car/Hôtels/Transferts/Omra
    // (getDefaultAgencyId) : on n'affiche jamais un package qu'un visiteur
    // anonyme ne pourrait ensuite pas réserver via le guest checkout.
    const agencyId = await getDefaultAgencyId()
    if (!agencyId) return []
    return await withSystemContext(async (db) => {
    const conditions = [eq(catalogPackages.status, "active"), eq(catalogPackages.agencyId, agencyId)]

    const searchTerm = filters.destination
      ? DESTINATION_SEARCH_TERMS[filters.destination]
      : undefined
    if (searchTerm) {
      conditions.push(ilike(catalogPackages.title, `%${searchTerm}%`))
    }

    if (filters.duration) {
      const range = parseDurationRange(filters.duration)
      if (range) {
        const [min, max] = range
        conditions.push(gte(catalogPackages.durationDays, min))
        if (max !== undefined) {
          conditions.push(sql`${catalogPackages.durationDays} <= ${max}`)
        }
      }
    }

    // Le mois de départ et le nombre de voyageurs se filtrent via les
    // départs programmés — aucune disponibilité inventée.
    const travelers = filters.travelers ? Number(filters.travelers) : undefined
    if (filters.month || (travelers && travelers > 0)) {
      const departureConditions = [
        eq(catalogPackageDepartures.status, "open"),
        gte(catalogPackageDepartures.departureDate, sql`CURRENT_DATE`),
      ]
      if (filters.month) {
        // <input type="month"> -> "YYYY-MM"
        const [year, month] = filters.month.split("-").map(Number)
        if (year && month) {
          departureConditions.push(
            sql`EXTRACT(YEAR FROM ${catalogPackageDepartures.departureDate}) = ${year} AND EXTRACT(MONTH FROM ${catalogPackageDepartures.departureDate}) = ${month}`,
          )
        }
      }
      if (travelers && travelers > 0) {
        departureConditions.push(
          sql`(${catalogPackageDepartures.totalSeats} - ${catalogPackageDepartures.bookedSeats}) >= ${travelers}`,
        )
      }

      const matchingDepartures = await db
        .selectDistinct({ packageId: catalogPackageDepartures.packageId })
        .from(catalogPackageDepartures)
        .where(and(...departureConditions))

      const packageIds = matchingDepartures.map((d) => d.packageId)
      if (packageIds.length === 0) return []
      conditions.push(inArray(catalogPackages.id, packageIds))
    }

    return await db
      .select()
      .from(catalogPackages)
      .where(and(...conditions))
      .orderBy(catalogPackages.title)
    })
  } catch {
    return []
  }
}

export default async function PackagesPage({
  searchParams,
}: {
  searchParams: Promise<SearchFilters>
}) {
  const filters = await searchParams
  const packages = await getActivePackages(filters)

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 bg-muted/30">
        <div className="bg-gradient-to-br from-violet-900 to-violet-700 px-4 py-12 text-white">
          <div className="mx-auto max-w-4xl text-center">
            <p className="mb-2 text-sm font-medium tracking-widest text-violet-300 uppercase">
              Voyages Organisés
            </p>
            <h1 className="mb-4 text-3xl font-bold md:text-4xl">
              Découvrez le monde avec Easy2Book
            </h1>
            <p className="mx-auto max-w-2xl text-violet-100">
              Circuits clés en main, vols + hôtels + guide inclus. Partez l&apos;esprit
              libre depuis la Tunisie.
            </p>
          </div>
        </div>

        <div className="mx-auto max-w-6xl px-4 py-8">
          <PackageSearch />
          <PackageList packages={packages} />
        </div>
      </main>
      <Footer />
    </div>
  )
}
