/**
 * Détail d'une attraction — /activities/[slug]
 *
 * ACTIVITY-B2C-FRONTEND-01 : affiche l'activité avec ses sessions disponibles
 * (dates + horaires + places + prix réels depuis catalog_activity_sessions).
 * Même pattern que /packages/[slug] — catalogue public scopé à l'agence OTA
 * via getDefaultAgencyId(), sans session utilisateur.
 */

import { cache } from "react"
import { Link } from "@/i18n/navigation"
import { notFound } from "next/navigation"
import Image from "next/image"
import { and, eq, gte, arrayContains } from "drizzle-orm"
import {
  ArrowLeft,
  Calendar,
  Check,
  Clock,
  MapPin,
  Phone,
  Users,
  X,
} from "lucide-react"
import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { withSystemContext } from "@/lib/db/tenant-context"
import { catalogActivities, catalogActivitySessions } from "@/lib/db/schema"
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"
import { LeadCaptureForm } from "@/components/leads/lead-capture-form"
import { ProductReviewsSection } from "@/components/reviews/product-reviews-section"
import { ProductMediaGallery } from "@/components/products/product-media-gallery"
import { getProductMedia } from "@/lib/media/query"
import { buildLanguageAlternates } from "@/lib/seo/alternate-languages"
import { getSiteContactInfo } from "@/lib/tenant/site-config"

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

      const today = new Date().toISOString().split("T")[0]!
      const sessionsRaw = await db
        .select()
        .from(catalogActivitySessions)
        .where(
          and(
            eq(catalogActivitySessions.activityId, activity.id),
            eq(catalogActivitySessions.status, "open"),
            gte(catalogActivitySessions.sessionDate, today),
          ),
        )
        .orderBy(
          catalogActivitySessions.sessionDate,
          catalogActivitySessions.sessionStart,
        )

      const sessions = sessionsRaw
        .map((s) => ({ ...s, capacityLeft: s.capacity - s.booked }))
        .filter((s) => s.capacityLeft > 0)

      const media = await getProductMedia(db, agencyId, "activity", activity.id)

      return { activity, sessions, media }
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
    activity.shortDescription ??
    activity.longDescription ??
    `Activité ${activity.title} — Easy2Book.`
  return {
    title: `${activity.title} — Attractions | Easy2Book`,
    description,
    alternates: {
      languages: buildLanguageAlternates(`/activities/${activity.slug}`),
    },
    openGraph: {
      title: activity.title,
      description,
      type: "website",
      url: `/activities/${activity.slug}`,
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
  const [result, contact] = await Promise.all([
    getActivityWithSessions(slug),
    getSiteContactInfo(),
  ])
  if (!result) notFound()
  const { activity, sessions, media } = result
  const contactPhone = contact?.contactPhone ?? null
  const waNumber =
    contact?.whatsappNumber ||
    (contactPhone ? contactPhone.replace("+", "") : null)

  const contactMessage = encodeURIComponent(
    `Bonjour, je souhaite des informations sur l'activité "${activity.title}".`,
  )

  const heroCover =
    media.find((m) => m.isCover)?.largeUrl ||
    media[0]?.largeUrl ||
    activity.coverImage

  const durationHours = activity.durationMinutes
    ? (activity.durationMinutes / 60).toFixed(1).replace(".0", "")
    : null

  const firstSession = sessions[0]
  const minPrice = firstSession ? parseFloat(firstSession.adultPriceTnd) : null

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="bg-muted/30 flex-1">
        {/* Hero */}
        <div className="bg-muted relative h-64 w-full md:h-80">
          {heroCover ? (
            <Image
              src={heroCover}
              alt={activity.title}
              fill
              className="object-cover"
              sizes="100vw"
              priority
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-gradient-to-br from-teal-900 to-teal-700">
              <MapPin className="h-16 w-16 text-white/30" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 px-4 pb-6">
            <div className="mx-auto max-w-4xl">
              <Link
                href="/activities"
                className="mb-3 inline-flex items-center gap-1.5 text-sm text-white/80 hover:text-white"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Retour aux activités
              </Link>
              <p className="mb-1 text-xs font-medium tracking-widest text-teal-300 uppercase">
                {activity.code}
              </p>
              <h1 className="text-2xl font-bold text-white md:text-3xl">
                {activity.title}
              </h1>
              {activity.location && (
                <p className="mt-1 flex items-center gap-1.5 text-sm text-white/80">
                  <MapPin className="h-3.5 w-3.5" />
                  {activity.location}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="mx-auto grid max-w-4xl gap-6 px-4 py-8 lg:grid-cols-3">
          {/* Main content */}
          <div className="space-y-6 lg:col-span-2">
            {media.length > 0 && (
              <ProductMediaGallery
                productName={activity.title}
                items={media.map((m) => ({
                  id: m.id,
                  largeUrl: m.largeUrl,
                  thumbnailUrl: m.thumbnailUrl,
                  altText: m.altText,
                }))}
              />
            )}

            {activity.longDescription && (
              <section className="bg-card rounded-xl border p-5">
                <h2 className="mb-3 text-lg font-semibold">Description</h2>
                <p className="text-muted-foreground text-sm whitespace-pre-line">
                  {activity.longDescription}
                </p>
              </section>
            )}

            {((activity.inclusions?.length ?? 0) > 0 ||
              (activity.exclusions?.length ?? 0) > 0) && (
              <section className="bg-card rounded-xl border p-5">
                <h2 className="mb-4 text-lg font-semibold">
                  Inclus / Non inclus
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {activity.inclusions && activity.inclusions.length > 0 && (
                    <ul className="space-y-1.5 text-sm">
                      {activity.inclusions.map((item) => (
                        <li key={item} className="flex items-start gap-2">
                          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  )}
                  {activity.exclusions && activity.exclusions.length > 0 && (
                    <ul className="text-muted-foreground space-y-1.5 text-sm">
                      {activity.exclusions.map((item) => (
                        <li key={item} className="flex items-start gap-2">
                          <X className="text-muted-foreground/60 mt-0.5 h-3.5 w-3.5 shrink-0" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            )}

            {/* Sessions disponibles */}
            <section className="bg-card rounded-xl border p-5">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                <Calendar className="h-4.5 w-4.5" />
                Prochaines sessions
              </h2>
              {sessions.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  {
                    "Aucune session n'est ouverte à la réservation pour le moment."
                  }
                  Contactez-nous pour connaître les prochaines dates.
                </p>
              ) : (
                <ul className="divide-y">
                  {sessions.map((s) => (
                    <li
                      key={s.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
                    >
                      <div>
                        <span className="font-medium capitalize">
                          {formatDate(s.sessionDate)}
                        </span>
                        <span className="text-muted-foreground">
                          {" "}
                          {s.sessionStart} – {s.sessionEnd}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge
                          variant="outline"
                          className={
                            s.capacityLeft > 5
                              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                              : "border-amber-300 bg-amber-50 text-amber-700"
                          }
                        >
                          {s.capacityLeft === 1
                            ? "1 place"
                            : `${s.capacityLeft} places`}
                        </Badge>
                        <span className="font-semibold text-teal-700">
                          {parseFloat(s.adultPriceTnd).toLocaleString("fr-FR")}{" "}
                          DT
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* Sidebar */}
          <aside className="lg:col-span-1">
            <div className="bg-card sticky top-4 rounded-xl border p-5">
              <div className="text-muted-foreground mb-4 grid grid-cols-2 gap-3 text-sm">
                {durationHours && (
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    {durationHours}h
                  </div>
                )}
                {activity.location && (
                  <div className="col-span-2 flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />
                    {activity.location}
                  </div>
                )}
              </div>

              {minPrice !== null && (
                <div className="mb-4">
                  <p className="text-muted-foreground text-xs">À partir de</p>
                  <p className="text-3xl font-bold text-teal-700">
                    {minPrice.toLocaleString("fr-FR")}
                    <span className="text-muted-foreground ml-1 text-sm font-normal">
                      DT / adulte
                    </span>
                  </p>
                  {firstSession?.childPriceTnd && (
                    <p className="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
                      <Users className="h-3 w-3" />
                      {parseFloat(firstSession.childPriceTnd).toLocaleString(
                        "fr-FR",
                      )}{" "}
                      DT / enfant
                    </p>
                  )}
                </div>
              )}

              {sessions.length > 0 ? (
                <>
                  <Button
                    asChild
                    className="w-full gap-2 bg-teal-700 hover:bg-teal-800"
                  >
                    <Link href={`/activities/${activity.slug}/book`}>
                      Réserver en ligne
                    </Link>
                  </Button>
                  {contactPhone && (
                    <p className="text-muted-foreground mt-2 text-center text-xs">
                      ou contactez un conseiller au{" "}
                      <a
                        href={`tel:${contactPhone}`}
                        className="font-medium text-teal-700"
                      >
                        {contactPhone}
                      </a>
                    </p>
                  )}
                </>
              ) : (
                <>
                  {waNumber && (
                    <Button
                      asChild
                      className="w-full gap-2 bg-teal-700 hover:bg-teal-800"
                    >
                      <a
                        href={`https://wa.me/${waNumber}?text=${contactMessage}`}
                      >
                        <Phone className="h-4 w-4" />
                        Contacter un conseiller
                      </a>
                    </Button>
                  )}
                  {contactPhone && (
                    <p className="text-muted-foreground mt-2 text-center text-xs">
                      ou appelez le{" "}
                      <a
                        href={`tel:${contactPhone}`}
                        className="font-medium text-teal-700"
                      >
                        {contactPhone}
                      </a>
                    </p>
                  )}
                </>
              )}
            </div>

            <div className="mt-4">
              <LeadCaptureForm
                productType="activity"
                productRef={activity.id}
                productLabel={activity.title}
                title="Être rappelé pour cette activité"
              />
            </div>
          </aside>
        </div>

        <div className="mx-auto max-w-4xl px-4 pb-8">
          <ProductReviewsSection
            agencyId={activity.agencyId}
            module="activity"
            productRef={activity.id}
          />
        </div>
      </main>
      <Footer />
    </div>
  )
}
