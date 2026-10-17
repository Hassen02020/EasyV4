/**
 * Page Attractions — /activities
 *
 * Server Component : charge le catalogue d'activités depuis catalog_activities
 * (sessions réelles pour le prix, même modèle que catalog_package_departures
 * pour les voyages organisés). B2C uniquement — filtré sur channels['b2c'].
 *
 * ACTIVITY-B2C-FRONTEND-01 : ce fichier était l'unique gap entre l'infrastructure
 * complète (server action + form + inngest handler) et la visibilité publique des
 * activités.
 */

import { MapPin } from "lucide-react"
import { Link } from "@/i18n/navigation"
import { getTranslations, getLocale } from "next-intl/server"
import Image from "next/image"
import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { ModuleHero } from "@/components/module-hero"
import { CatalogPagination } from "@/components/catalog-pagination"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { withSystemContext } from "@/lib/db/tenant-context"
import { catalogActivities, catalogActivitySessions, reviews } from "@/lib/db/schema"
import { and, eq, gte, inArray, sql, arrayContains } from "drizzle-orm"
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"
import { getCoverMediaForProducts } from "@/lib/media/query"
import { buildLanguageAlternates } from "@/lib/seo/alternate-languages"
import { paginateOffset } from "@/lib/admin/pagination"
import { getPublicModuleVisual } from "@/lib/public/site-content"
import type { CatalogActivity } from "@/lib/db/schema"

export const dynamic = "force-dynamic"

const PAGE_SIZE = 12

export const metadata = {
  title: "Attractions & Activités | Easy2Book",
  description:
    "Excursions, visites guidées et activités touristiques. Réservez en ligne, confirmé instantanément.",
  alternates: { languages: buildLanguageAlternates("/activities") },
}

interface SearchFilters {
  location?: string
  page?: string
}

type ActivityWithPrice = CatalogActivity & {
  priceFromTnd: number | null
  coverMediaUrl: string | null
}

interface ActivitiesPageResult {
  activities: ActivityWithPrice[]
  totalCount: number
  currentPage: number
  totalPages: number
}

const EMPTY_RESULT: ActivitiesPageResult = {
  activities: [],
  totalCount: 0,
  currentPage: 1,
  totalPages: 1,
}

async function getActiveActivities(
  filters: SearchFilters,
): Promise<ActivitiesPageResult> {
  const page = Math.max(1, Number.parseInt(filters.page ?? "1", 10) || 1)
  try {
    const agencyId = await getDefaultAgencyId()
    if (!agencyId) return EMPTY_RESULT
    return await withSystemContext(async (db) => {
      const conditions = [
        eq(catalogActivities.status, "published"),
        eq(catalogActivities.agencyId, agencyId),
        arrayContains(catalogActivities.channels, ["b2c"]),
      ]

      if (filters.location) {
        conditions.push(
          sql`${catalogActivities.location} ILIKE ${"%" + filters.location + "%"}`,
        )
      }

      const ratingOrderBy = sql`(SELECT COALESCE(AVG(${reviews.rating}), 0) FROM ${reviews} WHERE ${reviews.productRef} = ${catalogActivities.id}::text AND ${reviews.module} = 'activity' AND ${reviews.status} = 'approved' AND ${reviews.agencyId} = ${agencyId}) DESC, ${catalogActivities.title} ASC`

      const { data: rows, meta } = await paginateOffset<CatalogActivity>({
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

      // Prix "à partir de" depuis les sessions ouvertes (jamais inventé)
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
                  gte(
                    catalogActivitySessions.sessionDate,
                    new Date().toISOString().split("T")[0]!,
                  ),
                ),
              )
              .groupBy(catalogActivitySessions.activityId)

      const priceByActivity = new Map(
        priceRows.map((r) => [r.activityId, parseFloat(r.minPrice)]),
      )

      const coverByActivity = await getCoverMediaForProducts(
        db,
        agencyId,
        "activity",
        rows.map((a) => a.id),
      )

      return {
        activities: rows.map((act) => ({
          ...act,
          priceFromTnd: priceByActivity.get(act.id) ?? null,
          coverMediaUrl: coverByActivity.get(act.id)?.cardUrl ?? null,
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

function buildActivitiesHref(
  locale: string,
  filters: SearchFilters,
  page: number,
): string {
  const params = new URLSearchParams()
  if (filters.location) params.set("location", filters.location)
  if (page > 1) params.set("page", String(page))
  const qs = params.toString()
  return `/${locale}/activities${qs ? `?${qs}` : ""}`
}

function ActivityCard({ activity }: { activity: ActivityWithPrice }) {
  const cover = activity.coverMediaUrl || activity.coverImage
  const durationHours = activity.durationMinutes
    ? Math.round(activity.durationMinutes / 60)
    : null

  return (
    <Card className="flex flex-col overflow-hidden transition-shadow hover:shadow-md">
      <div className="bg-muted relative h-44 w-full">
        {cover ? (
          <Image
            src={cover}
            alt={activity.title}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 33vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-teal-800 to-teal-600">
            <MapPin className="h-12 w-12 text-white/40" />
          </div>
        )}
        {durationHours && durationHours > 0 && (
          <Badge className="absolute start-3 top-3 bg-black/60 text-white">
            {durationHours}h
          </Badge>
        )}
      </div>

      <CardContent className="flex flex-1 flex-col gap-3 p-5">
        <div>
          <p className="text-muted-foreground mb-0.5 text-xs tracking-wide uppercase">
            {activity.code}
          </p>
          <h3 className="line-clamp-2 font-semibold">{activity.title}</h3>
          {activity.location && (
            <p className="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
              <MapPin className="h-3 w-3" />
              {activity.location}
            </p>
          )}
        </div>

        {activity.shortDescription && (
          <p className="text-muted-foreground line-clamp-2 text-sm">
            {activity.shortDescription}
          </p>
        )}

        {activity.priceFromTnd !== null && (
          <p className="mt-auto text-sm">
            <span className="text-muted-foreground">À partir de </span>
            <span className="font-bold text-teal-700">
              {activity.priceFromTnd.toLocaleString("fr-FR")} DT
            </span>
            <span className="text-muted-foreground"> / adulte</span>
          </p>
        )}
      </CardContent>

      <CardFooter className="px-5 pb-5 pt-0">
        <Button asChild variant="outline" className="w-full">
          <Link href={`/activities/${activity.slug}`}>Voir l'activité</Link>
        </Button>
      </CardFooter>
    </Card>
  )
}

export default async function ActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<SearchFilters>
}) {
  const filters = await searchParams
  const [{ activities, totalCount, currentPage, totalPages }, visual] =
    await Promise.all([
      getActiveActivities(filters),
      getPublicModuleVisual("activites"),
    ])
  const t = await getTranslations("Common")
  const locale = await getLocale()

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="bg-muted/30 flex-1">
        <ModuleHero
          Icon={MapPin}
          gradient="from-teal-900 to-teal-700"
          imageUrl={visual?.heroImageUrl ?? "/images/activities-banner.svg"}
          kicker="Attractions & Activités"
          title="Découvrez, explorez, vivez"
          subtitle="Excursions, visites guidées et expériences uniques. Réservation instantanée, confirmation immédiate."
        />

        <div className="mx-auto max-w-6xl px-4 py-8">
          {totalCount > 0 && (
            <p className="text-muted-foreground mb-6 text-sm">
              {totalCount} {totalCount === 1 ? "activité disponible" : "activités disponibles"}
            </p>
          )}

          {activities.length === 0 ? (
            <div className="py-16 text-center">
              <MapPin className="text-muted-foreground/30 mx-auto mb-4 h-12 w-12" />
              <p className="font-medium">Aucune activité disponible pour le moment</p>
              <p className="text-muted-foreground mt-1 text-sm">
                Notre catalogue se remplit bientôt. Revenez nous voir !
              </p>
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {activities.map((act) => (
                <ActivityCard key={act.id} activity={act} />
              ))}
            </div>
          )}

          <CatalogPagination
            currentPage={currentPage}
            totalPages={totalPages}
            buildHref={(page) => buildActivitiesHref(locale, filters, page)}
            labels={{
              previous: t("paginationPrevious"),
              next: t("paginationNext"),
              previousAria: t("paginationPreviousAria"),
              nextAria: t("paginationNextAria"),
              goToPage: (page) => t("paginationGoToPage", { page }),
            }}
          />
        </div>
      </main>
      <Footer />
    </div>
  )
}
