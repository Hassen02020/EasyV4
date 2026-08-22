/**
 * Réservation d'un package Omra — /omra/[id]/book
 *
 * Point d'entrée réel du guest checkout Omra (Phase 12, Partie 7) : charge
 * le package + les départs réellement disponibles (même requête scopée à
 * l'agence OTA que `/omra/[id]`) et les passe à `OmraGuestBookingForm`, qui
 * soumet à `createGuestOmraBooking`. Remplace le seul point d'entrée
 * précédent (`/pro/sandbox`, données mockées, session partenaire requise).
 */

import Link from "next/link"
import { notFound } from "next/navigation"
import { and, eq, gte, arrayContains } from "drizzle-orm"
import { ArrowLeft } from "lucide-react"
import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { withSystemContext } from "@/lib/db/tenant-context"
import { omraAllotments, omraPackages } from "@/lib/db/schema"
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"
import { OmraGuestBookingForm } from "@/components/omra/omra-guest-booking-form"
import { BookingSteps } from "@/components/booking/booking-steps"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function getBookablePackage(id: string) {
  if (!UUID_RE.test(id)) return null
  const agencyId = await getDefaultAgencyId()
  if (!agencyId) return null
  return withSystemContext(async (db) => {
    const [pkg] = await db
      .select()
      .from(omraPackages)
      .where(
        and(
          eq(omraPackages.id, id),
          eq(omraPackages.status, "published"),
          eq(omraPackages.agencyId, agencyId),
          arrayContains(omraPackages.channels, ["b2c"]),
        ),
      )
      .limit(1)
    if (!pkg) return null

    const departures = await db
      .select()
      .from(omraAllotments)
      .where(
        and(
          eq(omraAllotments.packageId, id),
          eq(omraAllotments.status, "active"),
          gte(omraAllotments.availableCount, 1),
        ),
      )
      .orderBy(omraAllotments.departureDate)

    return { pkg, departures }
  })
}

export default async function OmraBookPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ date?: string }>
}) {
  const { id } = await params
  const { date } = await searchParams
  const result = await getBookablePackage(id)
  if (!result) notFound()
  const { pkg, departures } = result

  if (departures.length === 0) {
    notFound()
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="bg-muted/30 flex-1 py-8">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <Link
            href={`/omra/${pkg.id}`}
            className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1.5 text-sm"
          >
            <ArrowLeft className="size-4" />
            Retour au programme
          </Link>
          <h1 className="mb-2 text-2xl font-bold sm:text-3xl">{pkg.name}</h1>
          <p className="text-muted-foreground mb-6">
            Renseignez les fiches pèlerins et choisissez votre mode de
            règlement.
          </p>
          <BookingSteps current={2} />

          <div className="mt-8">
            <OmraGuestBookingForm
              packageId={pkg.id}
              packageName={pkg.name}
              basePrice={parseFloat(pkg.basePrice)}
              durationDays={pkg.durationDays}
              defaultDepartureDate={
                date && departures.some((d) => d.departureDate === date)
                  ? date
                  : undefined
              }
              departures={departures.map((d) => ({
                departureDate: d.departureDate,
                availableCount: d.availableCount,
                price: d.overridePrice
                  ? parseFloat(d.overridePrice)
                  : parseFloat(pkg.basePrice),
              }))}
            />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
