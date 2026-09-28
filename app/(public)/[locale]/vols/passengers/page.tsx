/**
 * /vols/passengers?snapshotId=<uuid>
 *
 * Server Component: loads the price snapshot to validate it is still ACTIVE
 * and render the itinerary summary. The selling price is read server-side and
 * formatted; the raw number is never returned to the client as an input field.
 * Only the snapshotId opaque token is passed to the form.
 */

import { Suspense } from "react"
import { notFound } from "next/navigation"
import { Loader2 } from "lucide-react"
import { getTranslations } from "next-intl/server"
import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { PassengerBookingForm } from "@/components/flights/passenger-booking-form"
import { getPriceSnapshot } from "@/lib/vols/price-snapshot"
import type { CanonicalItinerary, Ancillary } from "@/lib/vols/canonical"

interface Props {
  searchParams: Promise<{ snapshotId?: string }>
}

async function PassengersContent({ snapshotId }: { snapshotId: string }) {
  const t = await getTranslations("Vols")

  const snapshot = await getPriceSnapshot(snapshotId)
  if (!snapshot) notFound()

  const itinerary = snapshot.itinerary as unknown as CanonicalItinerary
  const firstJourney = itinerary.journeys?.[0]
  const lastJourney = itinerary.journeys?.[itinerary.journeys.length - 1] ?? firstJourney
  const firstSeg = firstJourney?.segments[0]
  const lastSeg = lastJourney?.segments[lastJourney.segments.length - 1] ?? firstSeg

  const origin = firstSeg?.origin ?? "—"
  const destination = lastSeg?.destination ?? "—"
  const routeDisplay = `${origin} → ${destination}`
  const departureDisplay = firstSeg?.departure
    ? new Date(firstSeg.departure).toLocaleString("fr-TN", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : ""

  const sellingAmount = Number(snapshot.sellingAmount)
  const sellingAmountDisplay = sellingAmount.toLocaleString("fr-TN", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })

  // Passenger count from adults + children metadata in itinerary (fallback to 1)
  const passengerCount = (itinerary as unknown as { adults?: number; children?: number }).adults ?? 1
  // G7: available ancillaries for this offer (prices are server-side, client only sends ids)
  const availableAncillaries: Ancillary[] = itinerary.ancillaries ?? []

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-foreground mb-6 text-xl font-bold">
        {t("finalizeBookingTitle")}
      </h1>
      <PassengerBookingForm
        snapshotId={snapshotId}
        passengerCount={passengerCount}
        sellingAmountDisplay={sellingAmountDisplay}
        sellingCurrency={snapshot.sellingCurrency}
        routeDisplay={routeDisplay}
        departureDisplay={departureDisplay}
        availableAncillaries={availableAncillaries}
      />
    </main>
  )
}

export default async function PassengersPage({ searchParams }: Props) {
  const { snapshotId } = await searchParams
  if (!snapshotId) notFound()

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <div className="flex-1 bg-muted/30">
        <Suspense
          fallback={
            <main className="mx-auto flex max-w-3xl items-center justify-center px-4 py-24">
              <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
            </main>
          }
        >
          <PassengersContent snapshotId={snapshotId} />
        </Suspense>
      </div>
      <Footer />
    </div>
  )
}
