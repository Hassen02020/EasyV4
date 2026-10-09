/**
 * Page Attractions — /attractions
 * Server Component : charge les attractions publiées depuis catalog_activities.
 * Phase 13.1, gap #1 — première page publique du module (le catalogue
 * existait depuis Phase 13, sans aucune vitrine publique jusqu'ici).
 */

import { Link } from "@/i18n/navigation"
import Image from "next/image"
import { getTranslations, getLocale } from "next-intl/server"
import { getIntlLocale } from "@/lib/i18n-date"
import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CatalogPagination } from "@/components/catalog-pagination"
import { withSystemContext } from "@/lib/db/tenant-context"
import {
  catalogActivities,
  catalogActivitySessions,
  reviews,
} from "@/lib/db/schema"
import {
  and,
  eq,
  arrayContains,
  gte,
  inArray,
  or,
  ilike,
  sql,
} from "drizzle-orm"
import { Input } from "@/components/ui/input"
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"
import { getCoverMediaForProducts } from "@/lib/media/query"
import { buildLanguageAlternates } from "@/lib/seo/alternate-languages"
import { paginateOffset } from "@/lib/admin/pagination"
import { MapPin, Clock, Compass, ChevronRight } from "lucide-react"
import { ModuleHero } from "@/components/module-hero"
import { getPublicModuleVisual } from "@/lib/public/site-content"

export const dynamic = "force-dynamic"

const PAGE_SIZE = 12

export const metadata = {
  title: "Attractions | Easy2Book",
  description:
    "Excursions, visites guidées et activités à réserver en ligne en Tunisie.",
  alternates: { languages: buildLanguageAlternates("/attractions") },
}

interface AttractionsPageResult {
  activities: Array<
    typeof catalogActivities.$inferSelect & {
      priceFromTnd: number | null
      coverMediaUrl: string | null
    }
  >
  totalCount: number
  currentPage: number
  totalPages: number
}

const EMPTY_RESULT: AttractionsPageResult = {
  activities: [],
  totalCount: 0,
  currentPage: 1,
  totalPages: 1,
}

async function getPublishedActivities(
  q: string | undefined,
  page: number,
): Promise<AttractionsPageResult> {
  try {
    const agencyId = await getDefaultAgencyId()
    if (!agencyId) return EMPTY_RESULT
    return await withSystemContext(async (db) => {
      const trimmedQ = q?.trim()
      const conditions = [
        eq(catalogActivities.status, "published"),
        eq(catalogActivities.agencyId, agencyId),
        arrayContains(catalogActivities.channels, ["b2c"]),
        trimmedQ
          ? or(
              ilike(catalogActivities.title, `%${trimmedQ}%`),
              ilike(catalogActivities.location, `%${trimmedQ}%`),
            )
          : undefined,
      ]

      // Chantier 8 (Ranking/Recommandation) : classées par note réelle
      // décroissante (avis approuvés) — repli sur l'ordre alphabétique
      // tant qu'aucun avis n'existe. Voir le commentaire équivalent dans
      // app/(public)/[locale]/packages/page.tsx.
      const ratingOrderBy = sql`(SELECT COALESCE(AVG(${reviews.rating}), 0) FROM ${reviews} WHERE ${reviews.productRef} = ${catalogActivities.id}::text AND ${reviews.module} = 'activity' AND ${reviews.status} = 'approved' AND ${reviews.agencyId} = ${agencyId}) DESC, ${catalogActivities.title} ASC`

      // Pagination SERP (chantier 6) — vraie pagination DB (.limit/.offset
      // via paginateOffset), jamais tout le catalogue chargé d'un coup.
      const { data: rows, meta } = await paginateOffset<
        typeof catalogActivities.$inferSelect
      >({
        query: db
          .select()
          .from(catalogActivities)
          .where(and(...conditions)),
        page,
        limit: PAGE_SIZE,
        orderBy: ratingOrderBy,
        countQuery: async () => {
          const [{ count }] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(catalogActivities)
            .where(and(...conditions))
          return count
        },
      })

      // Prix affiché sur les cartes ("À partir de X DT") — agrégé depuis les
      // sessions programmées réelles (jamais un prix inventé/statique sur
      // l'activité elle-même, qui n'a pas de colonne prix). Uniquement pour
      // la page courante.
      const priceRows =
        rows.length === 0
          ? []
          : await db
              .select({
                activityId: catalogActivitySessions.activityId,
                minPrice: sql<string>`MIN(${catalogActivitySessions.adultPriceTnd})`,
              })
              .from(catalogActivitySessions)
              .where(
                and(
                  inArray(
                    catalogActivitySessions.activityId,
                    rows.map((r) => r.id),
                  ),
                  eq(catalogActivitySessions.status, "open"),
                  gte(catalogActivitySessions.sessionDate, sql`CURRENT_DATE`),
                ),
              )
              .groupBy(catalogActivitySessions.activityId)

      const priceByActivity = new Map(
        priceRows.map((r) => [r.activityId, parseFloat(r.minPrice)]),
      )

      // Media System (mission §24) : couverture prioritaire sur a.coverImage
      // (legacy), en une seule requête pour toute la page.
      const coverByActivity = await getCoverMediaForProducts(
        db,
        agencyId,
        "activity",
        rows.map((r) => r.id),
      )

      return {
        activities: rows.map((a) => ({
          ...a,
          priceFromTnd: priceByActivity.get(a.id) ?? null,
          coverMediaUrl: coverByActivity.get(a.id)?.cardUrl ?? null,
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

function buildAttractionsHref(
  locale: string,
  q: string | undefined,
  page: number,
): string {
  const params = new URLSearchParams()
  if (q) params.set("q", q)
  if (page > 1) params.set("page", String(page))
  const qs = params.toString()
  return `/${locale}/attractions${qs ? `?${qs}` : ""}`
}

export default async function AttractionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>
}) {
  const { q, page: pageParam } = await searchParams
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1)
  const { activities, currentPage, totalPages } = await getPublishedActivities(
    q,
    page,
  )
  const t = await getTranslations("Attractions")
  const tCommon = await getTranslations("Common")
  const locale = await getLocale()
  const visual = await getPublicModuleVisual("attractions")

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="bg-muted/30 flex-1">
        <ModuleHero
          Icon={Compass}
          gradient="from-amber-900 to-amber-700"
          imageUrl={visual?.heroImageUrl ?? "https://images.unsplash.com/photo-1467269204594-9661b134dd2b?w=1800&q=85&auto=format&fit=crop"}
          kicker={t("kicker")}
          title={t("heroTitle")}
          subtitle={t("heroSubtitle")}
        >
          <form
            className="mx-auto flex max-w-lg gap-2"
            action={`/${locale}/attractions`}
          >
            <Input
              type="text"
              name="q"
              defaultValue={q ?? ""}
              placeholder={t("searchPlaceholder")}
              className="text-foreground bg-white/95"
            />
            <Button type="submit" className="bg-amber-600 hover:bg-amber-500">
              {t("searchButton")}
            </Button>
          </form>
        </ModuleHero>

        <div className="mx-auto max-w-6xl px-4 py-8">
          {activities.length === 0 ? (
            <div className="bg-card text-muted-foreground rounded-xl border p-10 text-center">
              <Compass className="text-muted-foreground/40 mx-auto mb-3 h-8 w-8" />
              {q?.trim()
                ? t("noResultsForQuery", { query: q })
                : t("emptyState")}
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {activities.map((a) => {
                // Fallback mission §23 : Media System en priorité, sinon
                // coverImage (legacy), sinon dégradé de marque (mission §33).
                const coverImage = a.coverMediaUrl || a.coverImage

                return (
                  <Link
                    key={a.id}
                    href={`/attractions/${a.slug}`}
                    className="group bg-card overflow-hidden rounded-xl border transition-shadow hover:shadow-lg"
                  >
                    <div className="bg-muted relative h-40 w-full">
                      {coverImage ? (
                        <Image
                          src={coverImage}
                          alt={a.title}
                          fill
                          className="object-cover transition-transform group-hover:scale-105"
                          sizes="(max-width: 768px) 100vw, 33vw"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center bg-gradient-to-br from-amber-800 to-amber-600">
                          <Compass className="h-10 w-10 text-white/30" />
                        </div>
                      )}
                    </div>
                    <div className="p-4">
                      {a.location && (
                        <Badge variant="outline" className="mb-2 gap-1 text-xs">
                          <MapPin className="h-3 w-3" />
                          {a.location}
                        </Badge>
                      )}
                      <h3 className="mb-1 font-semibold group-hover:text-amber-700">
                        {a.title}
                      </h3>
                      {a.shortDescription && (
                        <p className="text-muted-foreground mb-2 line-clamp-2 text-sm">
                          {a.shortDescription}
                        </p>
                      )}
                      {a.durationMinutes && (
                        <div className="text-muted-foreground mb-3 flex items-center gap-1 text-xs">
                          <Clock className="h-3 w-3" />
                          {t("durationMinutes", { minutes: a.durationMinutes })}
                        </div>
                      )}
                      {a.priceFromTnd != null && (
                        <div className="mb-3">
                          <p className="text-muted-foreground text-xs">
                            {t("startingFrom")}
                          </p>
                          <p className="text-2xl font-bold text-amber-700">
                            {a.priceFromTnd.toLocaleString(
                              getIntlLocale(locale),
                            )}
                            <span className="ml-1 text-sm font-normal">
                              {t("perPerson")}
                            </span>
                          </p>
                        </div>
                      )}
                      <Button
                        className="w-full gap-2 bg-amber-700 hover:bg-amber-800"
                        tabIndex={-1}
                      >
                        {t("viewAvailability")}
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
          <CatalogPagination
            currentPage={currentPage}
            totalPages={totalPages}
            buildHref={(p) => buildAttractionsHref(locale, q, p)}
            labels={{
              previous: tCommon("paginationPrevious"),
              next: tCommon("paginationNext"),
              previousAria: tCommon("paginationPreviousAria"),
              nextAria: tCommon("paginationNextAria"),
              goToPage: (p) => tCommon("paginationGoToPage", { page: p }),
            }}
          />
        </div>
      </main>
      <Footer />
    </div>
  )
}
