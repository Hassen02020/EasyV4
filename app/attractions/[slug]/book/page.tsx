/**
 * Réservation d'une attraction — /attractions/[slug]/book
 *
 * Point d'entrée du guest checkout Attractions (Phase 13.1, gap #1) : charge
 * l'attraction + les sessions réellement ouvertes (même requête scopée à
 * l'agence OTA que `/attractions/[slug]`) et les passe à
 * `ActivityGuestBookingForm`, qui soumet à `createGuestActivityBooking`.
 */

import Link from "next/link"
import { notFound } from "next/navigation"
import { and, eq, gte, arrayContains } from "drizzle-orm"
import { ArrowLeft } from "lucide-react"
import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { withSystemContext } from "@/lib/db/tenant-context"
import { catalogActivities, catalogActivitySessions } from "@/lib/db/schema"
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"
import { ActivityGuestBookingForm } from "@/components/activities/activity-guest-booking-form"
import { BookingSteps } from "@/components/booking/booking-steps"

async function getBookableActivity(slug: string) {
  const agencyId = await getDefaultAgencyId()
  if (!agencyId) return null
  return withSystemContext(async (db) => {
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
}

export default async function ActivityBookPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ session?: string }>
}) {
  const { slug } = await params
  const { session } = await searchParams
  const result = await getBookableActivity(slug)
  if (!result) notFound()
  const { activity, sessions } = result

  if (sessions.length === 0) {
    notFound()
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="bg-muted/30 flex-1 py-8">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <Link
            href={`/attractions/${activity.slug}`}
            className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1.5 text-sm"
          >
            <ArrowLeft className="size-4" />
            Retour à l&apos;attraction
          </Link>
          <h1 className="mb-2 text-2xl font-bold sm:text-3xl">{activity.title}</h1>
          <p className="text-muted-foreground mb-6">
            Choisissez votre session et vos informations de contact.
          </p>
          <BookingSteps current={2} />

          <div className="mt-8">
            <ActivityGuestBookingForm
              activityId={activity.id}
              activityTitle={activity.title}
              defaultSessionId={
                session && sessions.some((s) => s.id === session) ? session : undefined
              }
              sessions={sessions.map((s) => ({
                id: s.id,
                sessionDate: s.sessionDate,
                sessionStart: s.sessionStart,
                sessionEnd: s.sessionEnd,
                capacityLeft: s.capacityLeft,
                adultPriceTnd: parseFloat(s.adultPriceTnd),
                childPriceTnd: s.childPriceTnd ? parseFloat(s.childPriceTnd) : undefined,
              }))}
            />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
