/**
 * Page Voyages Organisés — /packages
 * Server Component : charge les packages depuis la table catalog_packages.
 */

import { Briefcase } from "lucide-react"
import { getTranslations, getLocale } from "next-intl/server"
import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { ModuleHero } from "@/components/module-hero"
import { PackageSearch } from "@/components/packages/package-search"
import { PackageList } from "@/components/packages/package-list"
import { CatalogPagination } from "@/components/catalog-pagination"
import { withSystemContext } from "@/lib/db/tenant-context"
import { catalogPackageDepartures, catalogPackages, reviews } from "@/lib/db/schema"
import { and, eq, gte, ilike, inArray, sql, arrayContains } from "drizzle-orm"
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"
import { getCoverMediaForProducts } from "@/lib/media/query"
import { buildLanguageAlternates } from "@/lib/seo/alternate-languages"
import { PACKAGE_DESTINATION_SEARCH_TERMS } from "@/lib/destinations/package-search-terms"
import { paginateOffset } from "@/lib/admin/pagination"

export const dynamic = "force-dynamic"

const PAGE_SIZE = 12

export const metadata = {
  title: "Voyages Organisés | Easy2Book",
  description:
    "Circuits et voyages organisés au départ de Tunisie. Istanbul, Dubaï, Paris, Rome et plus. Tout inclus.",
  alternates: { languages: buildLanguageAlternates("/packages") },
}

interface SearchFilters {
  destination?: string
  duration?: string
  month?: string
  travelers?: string
  page?: string
}

/** "3-5" -> [3, 5], "13+" -> [13, undefined] */
function parseDurationRange(duration: string): [number, number | undefined] | null {
  const plus = duration.match(/^(\d+)\+$/)
  if (plus) return [Number(plus[1]), undefined]
  const range = duration.match(/^(\d+)-(\d+)$/)
  if (range) return [Number(range[1]), Number(range[2])]
  return null
}

interface PackagesPageResult {
  packages: Array<
    typeof catalogPackages.$inferSelect & { priceFromTnd: number | null; coverMediaUrl: string | null }
  >
  totalCount: number
  currentPage: number
  totalPages: number
}

const EMPTY_RESULT: PackagesPageResult = { packages: [], totalCount: 0, currentPage: 1, totalPages: 1 }

async function getActivePackages(filters: SearchFilters): Promise<PackagesPageResult> {
  const page = Math.max(1, Number.parseInt(filters.page ?? "1", 10) || 1)
  try {
    // Catalogue public (trafic anonyme, pas de session storefront) — scopé à
    // l'agence OTA directe, même modèle que Car/Hôtels/Transferts/Omra
    // (getDefaultAgencyId) : on n'affiche jamais un package qu'un visiteur
    // anonyme ne pourrait ensuite pas réserver via le guest checkout.
    const agencyId = await getDefaultAgencyId()
    if (!agencyId) return EMPTY_RESULT
    return await withSystemContext(async (db) => {
    const conditions = [eq(catalogPackages.status, "published"), eq(catalogPackages.agencyId, agencyId), arrayContains(catalogPackages.channels, ["b2c"])]

    const searchTerm = filters.destination
      ? PACKAGE_DESTINATION_SEARCH_TERMS[filters.destination]
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
      if (packageIds.length === 0) return EMPTY_RESULT
      conditions.push(inArray(catalogPackages.id, packageIds))
    }

    // Chantier 8 (Ranking/Recommandation) : classés par note réelle
    // décroissante (avis approuvés, lib/reviews/reviews-core.ts) — sous-
    // requête corrélée (pas de JOIN, catalogue trop petit pour en avoir
    // besoin) ; repli sur l'ordre alphabétique tant qu'aucun avis n'existe
    // (comportement inchangé aujourd'hui). Calculée au niveau SQL (pas en
    // mémoire après coup) pour rester correcte même paginée.
    const ratingOrderBy = sql`(SELECT COALESCE(AVG(${reviews.rating}), 0) FROM ${reviews} WHERE ${reviews.productRef} = ${catalogPackages.id}::text AND ${reviews.module} = 'package' AND ${reviews.status} = 'approved' AND ${reviews.agencyId} = ${agencyId}) DESC, ${catalogPackages.title} ASC`

    // Pagination SERP (chantier 6) — vraie pagination DB (.limit/.offset via
    // paginateOffset), jamais tout le catalogue chargé d'un coup.
    const { data: rows, meta } = await paginateOffset<typeof catalogPackages.$inferSelect>({
      query: db.select().from(catalogPackages).where(and(...conditions)),
      page,
      limit: PAGE_SIZE,
      orderBy: ratingOrderBy,
      countQuery: async () => {
        const [{ count }] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(catalogPackages)
          .where(and(...conditions))
        return count
      },
    })

    // Prix affiché sur les cartes liste ("À partir de X DT") — agrégé depuis
    // les départs programmés réels (jamais un prix inventé/statique sur le
    // package lui-même, qui n'a pas de colonne prix). Uniquement pour la
    // page courante — pas tout le catalogue.
    const priceRows =
      rows.length === 0
        ? []
        : await db
            .select({
              packageId: catalogPackageDepartures.packageId,
              minPrice: sql<string>`MIN(${catalogPackageDepartures.adultPriceTnd})`,
            })
            .from(catalogPackageDepartures)
            .where(
              and(
                inArray(catalogPackageDepartures.packageId, rows.map((r) => r.id)),
                eq(catalogPackageDepartures.status, "open"),
                gte(catalogPackageDepartures.departureDate, sql`CURRENT_DATE`),
              ),
            )
            .groupBy(catalogPackageDepartures.packageId)

    const priceByPackage = new Map(priceRows.map((r) => [r.packageId, parseFloat(r.minPrice)]))

    // Media System (mission §24) : couverture prioritaire sur pkg.coverImage
    // (legacy), en une seule requête pour toute la page.
    const coverByPackage = await getCoverMediaForProducts(db, agencyId, "package", rows.map((p) => p.id))

    return {
      packages: rows.map((pkg) => ({
        ...pkg,
        priceFromTnd: priceByPackage.get(pkg.id) ?? null,
        coverMediaUrl: coverByPackage.get(pkg.id)?.cardUrl ?? null,
      })),
      totalCount: meta.totalCount ?? 0,
      currentPage: meta.currentPage,
      totalPages: meta.totalPages ?? 1,
    }
    })
  } catch {
    return EMPTY_RESULT
  }
}

function buildPackagesHref(locale: string, filters: SearchFilters, page: number): string {
  const params = new URLSearchParams()
  if (filters.destination) params.set("destination", filters.destination)
  if (filters.duration) params.set("duration", filters.duration)
  if (filters.month) params.set("month", filters.month)
  if (filters.travelers) params.set("travelers", filters.travelers)
  if (page > 1) params.set("page", String(page))
  const qs = params.toString()
  return `/${locale}/packages${qs ? `?${qs}` : ""}`
}

export default async function PackagesPage({
  searchParams,
}: {
  searchParams: Promise<SearchFilters>
}) {
  const filters = await searchParams
  const { packages, totalCount, currentPage, totalPages } = await getActivePackages(filters)
  const t = await getTranslations("Packages")
  const tCommon = await getTranslations("Common")
  const locale = await getLocale()

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 bg-muted/30">
        <ModuleHero
          Icon={Briefcase}
          gradient="from-violet-900 to-violet-700"
          imageUrl="https://images.unsplash.com/photo-1530789253388-582c481c54b0?w=1800&q=85&auto=format&fit=crop"
          kicker={t("kicker")}
          title={t("heroTitle")}
          subtitle={t("heroSubtitle")}
        />

        <div className="mx-auto max-w-6xl px-4 py-8">
          <PackageSearch />
          <PackageList packages={packages} totalCount={totalCount} />
          <CatalogPagination
            currentPage={currentPage}
            totalPages={totalPages}
            buildHref={(page) => buildPackagesHref(locale, filters, page)}
            labels={{
              previous: tCommon("paginationPrevious"),
              next: tCommon("paginationNext"),
              previousAria: tCommon("paginationPreviousAria"),
              nextAria: tCommon("paginationNextAria"),
              goToPage: (page) => tCommon("paginationGoToPage", { page }),
            }}
          />
        </div>
      </main>
      <Footer />
    </div>
  )
}
