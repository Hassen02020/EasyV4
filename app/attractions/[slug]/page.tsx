/**
 * Détail d'une attraction — /attractions/[slug]
 *
 * Catalogue → Détail → Réservation (Phase 13.1, gap #1). Le catalogue
 * Attractions existait depuis Phase 13 (Master Admin Builder) mais
 * n'avait encore aucune page publique — cette page + `/attractions` +
 * `/attractions/[slug]/book` sont les 3 pièces manquantes, sur le modèle
 * exact d'Omra/Packages (Phase 12/13).
 */

import { cache } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { and, eq, gte, arrayContains } from "drizzle-orm"
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  MapPin,
  ShieldCheck,
  XCircle,
} from "lucide-react"
import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { withSystemContext } from "@/lib/db/tenant-context"
import { catalogActivities, catalogActivitySessions } from "@/lib/db/schema"
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"
import { ProductReviewsSection } from "@/components/reviews/product-reviews-section"

function formatDate(d: string | Date | null): string {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

const getActivityWithSessions = cache(async (slug: string) => {
  try {
    const agencyId = await getDefaultAgencyId()
    if (!agencyId) return null
    return await withSystemContext(async (db) => {
      const [activity] = await db
        .select()
        .from(catalogActivities)
        .where(
          and(
            eq(catalogActivities.slug, slug),
            eq(catalogActivities.status, "published"),
            eq(catalogActivities.agencyId, agencyId),
            arrayContains(catalogActivities.channels, ["b2c"]),
          ),
        )
        .limit(1)
      if (!activity) return null

      const sessionsRaw = await db
        .select()
        .from(catalogActivitySessions)
        .where(
          and(
            eq(catalogActivitySessions.activityId, activity.id),
            eq(catalogActivitySessions.status, "open"),
            gte(catalogActivitySessions.sessionDate, new Date().toISOString().split("T")[0]!),
          ),
        )
        .orderBy(catalogActivitySessions.sessionDate)

      const now = new Date()
      const sessions = sessionsRaw
        .map((s) => ({ ...s, capacityLeft: s.capacity - s.booked }))
        .filter((s) => {
          if (s.capacityLeft <= 0) return false
          const deadline = s.bookingDeadline ?? new Date(`${s.sessionDate}T${s.sessionStart}:00`)
          return now < deadline
        })

      return { activity, sessions }
    })
  } catch {
    return null
  }
})

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const result = await getActivityWithSessions(slug)
  if (!result) return {}
  const { activity } = result
  const description =
    activity.shortDescription ?? activity.longDescription ?? `${activity.title} — Easy2Book Attractions.`
  return {
    title: `${activity.title} — Attractions | Easy2Book`,
    description,
    openGraph: {
      title: activity.title,
      description,
      type: "website",
      url: `/attractions/${activity.slug}`,
      images: activity.coverImage ? [{ url: activity.coverImage }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: activity.title,
      description,
      images: activity.coverImage ? [activity.coverImage] : undefined,
    },
  }
}

export default async function ActivityDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const result = await getActivityWithSessions(slug)
  if (!result) notFound()
  const { activity, sessions } = result

  const priceTnd = sessions[0] ? parseFloat(sessions[0].adultPriceTnd) : null

  const inclusions = activity.inclusions ?? []
  const exclusions = activity.exclusions ?? []

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 bg-muted/30">
        <div className="bg-gradient-to-br from-teal-900 to-teal-700 px-4 py-10 text-white">
          <div className="mx-auto max-w-4xl">
            <Link
              href="/attractions"
              className="mb-4 inline-flex items-center gap-1.5 text-sm text-teal-200 hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Retour aux attractions
            </Link>
            {activity.location && (
              <Badge variant="secondary" className="mb-3 bg-white/20 text-white">
                <MapPin className="mr-1 h-3 w-3" />
                {activity.location}
              </Badge>
            )}
            <h1 className="mb-2 text-2xl font-bold md:text-3xl">{activity.title}</h1>
            {activity.shortDescription && (
              <p className="max-w-2xl text-teal-100">{activity.shortDescription}</p>
            )}
          </div>
        </div>

        <div className="mx-auto grid max-w-4xl gap-6 px-4 py-8 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {activity.longDescription && (
              <section className="rounded-xl border bg-card p-5">
                <h2 className="mb-3 text-lg font-semibold">Description</h2>
                <p className="whitespace-pre-line text-sm text-muted-foreground">
                  {activity.longDescription}
                </p>
              </section>
            )}

            {(inclusions.length > 0 || exclusions.length > 0) && (
              <section className="rounded-xl border bg-card p-5">
                <h2 className="mb-4 text-lg font-semibold">Inclus / Non inclus</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {inclusions.length > 0 && (
                    <ul className="space-y-1.5 text-sm">
                      {inclusions.map((item) => (
                        <li key={item} className="flex items-start gap-2">
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  )}
                  {exclusions.length > 0 && (
                    <ul className="space-y-1.5 text-sm text-muted-foreground">
                      {exclusions.map((item) => (
                        <li key={item} className="flex items-start gap-2">
                          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {activity.durationMinutes && (
                  <div className="mt-4 flex items-center gap-1.5 border-t pt-4 text-sm text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    Durée : {activity.durationMinutes} minutes
                  </div>
                )}
              </section>
            )}

            <section className="rounded-xl border bg-card p-5">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                <Calendar className="h-4.5 w-4.5" />
                Sessions disponibles
              </h2>
              {sessions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucune session n&apos;est ouverte à la réservation pour le moment.
                </p>
              ) : (
                <ul className="divide-y">
                  {sessions.map((s) => (
                    <li
                      key={s.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
                    >
                      <div>
                        <span className="font-medium capitalize">{formatDate(s.sessionDate)}</span>
                        <span className="text-muted-foreground">
                          {" "}
                          · {s.sessionStart}–{s.sessionEnd}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge
                          variant="outline"
                          className={
                            s.capacityLeft > 10
                              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                              : "border-amber-300 bg-amber-50 text-amber-700"
                          }
                        >
                          {s.capacityLeft} place{s.capacityLeft > 1 ? "s" : ""}
                        </Badge>
                        <span className="font-semibold text-teal-700">
                          {parseFloat(s.adultPriceTnd).toLocaleString("fr-FR")} DT
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <aside className="lg:col-span-1">
            <div className="sticky top-4 rounded-xl border bg-card p-5">
              {priceTnd && (
                <div className="mb-4">
                  <p className="text-xs text-muted-foreground">À partir de</p>
                  <p className="text-3xl font-bold text-teal-700">
                    {priceTnd.toLocaleString("fr-FR")}
                    <span className="ml-1 text-sm font-normal text-muted-foreground">
                      DT / adulte
                    </span>
                  </p>
                </div>
              )}
              {sessions.length > 0 ? (
                <Button asChild className="w-full gap-2 bg-teal-700 hover:bg-teal-800">
                  <Link href={`/attractions/${activity.slug}/book`}>Réserver en ligne</Link>
                </Button>
              ) : (
                <Button disabled className="w-full">
                  Aucune session disponible
                </Button>
              )}
              <div className="mt-4 flex items-start gap-2 rounded-lg bg-teal-50 p-3 text-xs text-teal-800">
                <ShieldCheck className="h-4 w-4 shrink-0" />
                <span>Paiement sécurisé, confirmation immédiate, voucher e-billet.</span>
              </div>
            </div>
          </aside>
        </div>

        <div className="mx-auto max-w-4xl px-4 pb-8">
          <ProductReviewsSection agencyId={activity.agencyId} module="activity" productRef={activity.id} />
        </div>
      </main>
      <Footer />
    </div>
  )
}
