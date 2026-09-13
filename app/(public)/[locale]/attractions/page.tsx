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
import { withSystemContext } from "@/lib/db/tenant-context"
import { catalogActivities, catalogActivitySessions } from "@/lib/db/schema"
import { and, eq, arrayContains, gte, inArray, or, ilike, sql } from "drizzle-orm"
import { Input } from "@/components/ui/input"
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"
import { getCoverMediaForProducts } from "@/lib/media/query"
import { buildLanguageAlternates } from "@/lib/seo/alternate-languages"
import { MapPin, Clock, Compass, ChevronRight } from "lucide-react"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Attractions | Easy2Book",
  description: "Excursions, visites guidées et activités à réserver en ligne en Tunisie.",
  alternates: { languages: buildLanguageAlternates("/attractions") },
}

async function getPublishedActivities(q?: string) {
  try {
    const agencyId = await getDefaultAgencyId()
    if (!agencyId) return []
    return await withSystemContext(async (db) => {
      const trimmedQ = q?.trim()
      const rows = await db
        .select()
        .from(catalogActivities)
        .where(
          and(
            eq(catalogActivities.status, "published"),
            eq(catalogActivities.agencyId, agencyId),
            arrayContains(catalogActivities.channels, ["b2c"]),
            trimmedQ
              ? or(
                  ilike(catalogActivities.title, `%${trimmedQ}%`),
                  ilike(catalogActivities.location, `%${trimmedQ}%`),
                )
              : undefined,
          ),
        )
        .orderBy(catalogActivities.title)

      // Prix affiché sur les cartes ("À partir de X DT") — agrégé depuis les
      // sessions programmées réelles (jamais un prix inventé/statique sur
      // l'activité elle-même, qui n'a pas de colonne prix).
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
                  inArray(catalogActivitySessions.activityId, rows.map((r) => r.id)),
                  eq(catalogActivitySessions.status, "open"),
                  gte(catalogActivitySessions.sessionDate, sql`CURRENT_DATE`),
                ),
              )
              .groupBy(catalogActivitySessions.activityId)

      const priceByActivity = new Map(priceRows.map((r) => [r.activityId, parseFloat(r.minPrice)]))

      // Media System (mission §24) : couverture prioritaire sur a.coverImage
      // (legacy), en une seule requête pour toute la liste.
      const coverByActivity = await getCoverMediaForProducts(db, agencyId, "activity", rows.map((r) => r.id))

      return rows.map((a) => ({
        ...a,
        priceFromTnd: priceByActivity.get(a.id) ?? null,
        coverMediaUrl: coverByActivity.get(a.id)?.cardUrl ?? null,
      }))
    })
  } catch {
    return []
  }
}

export default async function AttractionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const activities = await getPublishedActivities(q)
  const t = await getTranslations("Attractions")
  const locale = await getLocale()

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 bg-muted/30">
        <div className="bg-gradient-to-br from-teal-900 to-teal-700 px-4 py-12 text-white">
          <div className="mx-auto max-w-4xl text-center">
            <p className="mb-2 text-sm font-medium tracking-widest text-teal-300 uppercase">
              {t("kicker")}
            </p>
            <h1 className="mb-4 text-3xl font-bold md:text-4xl">
              {t("heroTitle")}
            </h1>
            <p className="mx-auto mb-6 max-w-2xl text-teal-100">
              {t("heroSubtitle")}
            </p>
            <form className="mx-auto flex max-w-lg gap-2" action="/attractions">
              <Input
                type="text"
                name="q"
                defaultValue={q ?? ""}
                placeholder={t("searchPlaceholder")}
                className="bg-white/95 text-foreground"
              />
              <Button type="submit" className="bg-teal-600 hover:bg-teal-500">
                {t("searchButton")}
              </Button>
            </form>
          </div>
        </div>

        <div className="mx-auto max-w-6xl px-4 py-8">
          {activities.length === 0 ? (
            <div className="rounded-xl border bg-card p-10 text-center text-muted-foreground">
              <Compass className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
              {q?.trim() ? t("noResultsForQuery", { query: q }) : t("emptyState")}
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
                  className="group overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-lg"
                >
                  <div className="relative h-40 w-full bg-muted">
                    {coverImage ? (
                      <Image
                        src={coverImage}
                        alt={a.title}
                        fill
                        className="object-cover transition-transform group-hover:scale-105"
                        sizes="(max-width: 768px) 100vw, 33vw"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-gradient-to-br from-teal-800 to-teal-600">
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
                    <h3 className="mb-1 font-semibold group-hover:text-teal-700">{a.title}</h3>
                    {a.shortDescription && (
                      <p className="mb-2 line-clamp-2 text-sm text-muted-foreground">
                        {a.shortDescription}
                      </p>
                    )}
                    {a.durationMinutes && (
                      <div className="mb-3 flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {t("durationMinutes", { minutes: a.durationMinutes })}
                      </div>
                    )}
                    {a.priceFromTnd != null && (
                      <div className="mb-3">
                        <p className="text-xs text-muted-foreground">{t("startingFrom")}</p>
                        <p className="text-2xl font-bold text-teal-700">
                          {a.priceFromTnd.toLocaleString(getIntlLocale(locale))}
                          <span className="ml-1 text-sm font-normal">{t("perPerson")}</span>
                        </p>
                      </div>
                    )}
                    <Button className="w-full gap-2 bg-teal-700 hover:bg-teal-800" tabIndex={-1}>
                      {t("viewAvailability")}
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </Link>
                )
              })}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  )
}
