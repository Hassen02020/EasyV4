/**
 * Page de recherche Omra — /omra
 * Server Component : charge les packages disponibles depuis la DB.
 */

import { Suspense } from "react"
import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { OmraSearch } from "@/components/omra/omra-search"
import { OmraPackageList } from "@/components/omra/omra-package-list"
import { withSystemContext } from "@/lib/db/tenant-context"
import { omraAllotments, omraPackages, omraPackageType } from "@/lib/db/schema"
import { and, eq, gte, inArray, sql } from "drizzle-orm"
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Omraty — Réservez votre Omra | Easy2Book",
  description:
    "Packages Omra tout inclus au départ de Tunisie. Vols, hôtels Médine/La Mecque, visa, transport.",
}

interface SearchFilters {
  programme?: string
  month?: string
  pilgrims?: string
}

async function getActivePackages(filters: SearchFilters) {
  try {
    // Catalogue public (trafic anonyme, pas de session storefront) — scopé à
    // l'agence OTA directe, même modèle que Car/Hôtels/Transferts
    // (getDefaultAgencyId) : on n'affiche jamais un package qu'un visiteur
    // anonyme ne pourrait ensuite pas réserver via le guest checkout.
    const agencyId = await getDefaultAgencyId()
    if (!agencyId) return []
    return await withSystemContext(async (db) => {
    const conditions = [eq(omraPackages.status, "published"), eq(omraPackages.agencyId, agencyId)]

    const programme = filters.programme
    if (programme && (omraPackageType.enumValues as readonly string[]).includes(programme)) {
      conditions.push(eq(omraPackages.type, programme as (typeof omraPackageType.enumValues)[number]))
    }

    // Le mois de départ et le nombre de pèlerins se filtrent via les
    // allotements (aucun package sans date de départ correspondante n'est
    // affiché) — jamais de disponibilité inventée.
    const month = filters.month ? Number(filters.month) : undefined
    const pilgrims = filters.pilgrims ? Number(filters.pilgrims) : undefined
    if ((month && month >= 1 && month <= 12) || (pilgrims && pilgrims > 0)) {
      const allotmentConditions = [
        eq(omraAllotments.status, "active"),
        gte(omraAllotments.departureDate, sql`CURRENT_DATE`),
      ]
      if (month && month >= 1 && month <= 12) {
        allotmentConditions.push(
          sql`EXTRACT(MONTH FROM ${omraAllotments.departureDate}) = ${month}`,
        )
      }
      if (pilgrims && pilgrims > 0) {
        allotmentConditions.push(gte(omraAllotments.availableCount, pilgrims))
      }

      const matchingAllotments = await db
        .selectDistinct({ packageId: omraAllotments.packageId })
        .from(omraAllotments)
        .where(and(...allotmentConditions))

      const packageIds = matchingAllotments.map((a) => a.packageId)
      if (packageIds.length === 0) return []
      conditions.push(inArray(omraPackages.id, packageIds))
    }

    return await db
      .select()
      .from(omraPackages)
      .where(and(...conditions))
      .orderBy(omraPackages.validFrom)
    })
  } catch {
    return []
  }
}

export default async function OmraPage({
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
        <div className="bg-gradient-to-br from-emerald-900 to-emerald-700 px-4 py-12 text-white">
          <div className="mx-auto max-w-4xl text-center">
            <p className="mb-2 text-sm font-medium tracking-widest text-emerald-300 uppercase">
              Module Omraty
            </p>
            <h1 className="mb-4 text-3xl font-bold md:text-4xl">
              Réservez votre Omra sereinement
            </h1>
            <p className="mx-auto max-w-2xl text-emerald-100">
              Packages tout inclus — vols, hôtels étoilés à Médine et La Mecque,
              transport, visa et assistance 7j/7.
            </p>
          </div>
        </div>

        <div className="mx-auto max-w-6xl px-4 py-8">
          <OmraSearch />

          <Suspense
            fallback={
              <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-64 animate-pulse rounded-xl bg-muted"
                  />
                ))}
              </div>
            }
          >
            <OmraPackageList packages={packages} />
          </Suspense>
        </div>
      </main>
      <Footer />
    </div>
  )
}
