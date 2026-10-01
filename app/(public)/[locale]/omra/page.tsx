/**
 * Page de recherche Omra — /omra
 * Server Component : charge les packages disponibles depuis la DB.
 */

import { Suspense } from "react"
import { Moon } from "lucide-react"
import { getTranslations, getLocale } from "next-intl/server"
import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { ModuleHero } from "@/components/module-hero"
import { OmraSearch } from "@/components/omra/omra-search"
import { OmraPackageList } from "@/components/omra/omra-package-list"
import { CatalogPagination } from "@/components/catalog-pagination"
import { withSystemContext } from "@/lib/db/tenant-context"
import { omraAllotments, omraPackages, omraPackageType, reviews } from "@/lib/db/schema"
import { and, eq, gte, inArray, sql, arrayContains } from "drizzle-orm"
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"
import { getCoverMediaForProducts } from "@/lib/media/query"
import { buildLanguageAlternates } from "@/lib/seo/alternate-languages"
import { paginateOffset } from "@/lib/admin/pagination"

export const dynamic = "force-dynamic"

const PAGE_SIZE = 12

export const metadata = {
  title: "Omraty — Réservez votre Omra | Easy2Book",
  description:
    "Packages Omra tout inclus au départ de Tunisie. Vols, hôtels Médine/La Mecque, visa, transport.",
  alternates: { languages: buildLanguageAlternates("/omra") },
}

interface SearchFilters {
  programme?: string
  month?: string
  pilgrims?: string
  page?: string
}

interface OmraPageResult {
  packages: Array<typeof omraPackages.$inferSelect & { coverMediaUrl: string | null }>
  totalCount: number
  currentPage: number
  totalPages: number
}

const EMPTY_RESULT: OmraPageResult = { packages: [], totalCount: 0, currentPage: 1, totalPages: 1 }

async function getActivePackages(filters: SearchFilters): Promise<OmraPageResult> {
  const page = Math.max(1, Number.parseInt(filters.page ?? "1", 10) || 1)
  try {
    // Catalogue public (trafic anonyme, pas de session storefront) — scopé à
    // l'agence OTA directe, même modèle que Car/Hôtels/Transferts
    // (getDefaultAgencyId) : on n'affiche jamais un package qu'un visiteur
    // anonyme ne pourrait ensuite pas réserver via le guest checkout.
    const agencyId = await getDefaultAgencyId()
    if (!agencyId) return EMPTY_RESULT
    return await withSystemContext(async (db) => {
    const conditions = [eq(omraPackages.status, "published"), eq(omraPackages.agencyId, agencyId), arrayContains(omraPackages.channels, ["b2c"])]

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
      if (packageIds.length === 0) return EMPTY_RESULT
      conditions.push(inArray(omraPackages.id, packageIds))
    }

    // Chantier 8 (Ranking/Recommandation) : classés par note réelle
    // décroissante (avis approuvés) — repli sur l'ordre par date de départ
    // déjà en place tant qu'aucun avis n'existe (comportement inchangé
    // aujourd'hui). Voir le commentaire équivalent dans
    // app/(public)/[locale]/packages/page.tsx.
    const ratingOrderBy = sql`(SELECT COALESCE(AVG(${reviews.rating}), 0) FROM ${reviews} WHERE ${reviews.productRef} = ${omraPackages.id}::text AND ${reviews.module} = 'omra' AND ${reviews.status} = 'approved' AND ${reviews.agencyId} = ${agencyId}) DESC, ${omraPackages.validFrom} ASC`

    // Pagination SERP (chantier 6) — vraie pagination DB (.limit/.offset via
    // paginateOffset), jamais tout le catalogue chargé d'un coup.
    const { data: rows, meta } = await paginateOffset<typeof omraPackages.$inferSelect>({
      query: db.select().from(omraPackages).where(and(...conditions)),
      page,
      limit: PAGE_SIZE,
      orderBy: ratingOrderBy,
      countQuery: async () => {
        const [{ count }] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(omraPackages)
          .where(and(...conditions))
        return count
      },
    })

    // Media System (mission §24) : couverture prioritaire sur le fallback
    // legacy metadata.coverImage, en une seule requête pour toute la page.
    const coverByPackage = await getCoverMediaForProducts(db, agencyId, "omra", rows.map((p) => p.id))
    return {
      packages: rows.map((pkg) => ({ ...pkg, coverMediaUrl: coverByPackage.get(pkg.id)?.cardUrl ?? null })),
      totalCount: meta.totalCount ?? 0,
      currentPage: meta.currentPage,
      totalPages: meta.totalPages ?? 1,
    }
    })
  } catch {
    return EMPTY_RESULT
  }
}

function buildOmraHref(locale: string, filters: SearchFilters, page: number): string {
  const params = new URLSearchParams()
  if (filters.programme) params.set("programme", filters.programme)
  if (filters.month) params.set("month", filters.month)
  if (filters.pilgrims) params.set("pilgrims", filters.pilgrims)
  if (page > 1) params.set("page", String(page))
  const qs = params.toString()
  return `/${locale}/omra${qs ? `?${qs}` : ""}`
}

export default async function OmraPage({
  searchParams,
}: {
  searchParams: Promise<SearchFilters>
}) {
  const filters = await searchParams
  const { packages, totalCount, currentPage, totalPages } = await getActivePackages(filters)
  const t = await getTranslations("Omra")
  const tCommon = await getTranslations("Common")
  const locale = await getLocale()

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 bg-muted/30">
        <ModuleHero
          Icon={Moon}
          gradient="from-emerald-900 to-emerald-700"
          imageUrl="https://images.unsplash.com/photo-1564769625905-50e93615e769?w=1800&q=85&auto=format&fit=crop"
          kicker={t("kicker")}
          title={t("heroTitle")}
          subtitle={t("heroSubtitle")}
        />

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
            <OmraPackageList packages={packages} totalCount={totalCount} />
          </Suspense>
          <CatalogPagination
            currentPage={currentPage}
            totalPages={totalPages}
            buildHref={(page) => buildOmraHref(locale, filters, page)}
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
