/**
 * Réservation d'un voyage organisé — /packages/[slug]/book
 *
 * Point d'entrée du guest checkout Packages (Phase 12, Partie 9-10) : charge
 * le package + les départs réellement ouverts (même requête scopée à
 * l'agence OTA que `/packages/[slug]`) et les passe à
 * `PackageGuestBookingForm`, qui soumet à `createGuestPackageBooking`.
 */

import Link from "next/link"
import { notFound } from "next/navigation"
import { and, eq, gte } from "drizzle-orm"
import { ArrowLeft } from "lucide-react"
import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { withSystemContext } from "@/lib/db/tenant-context"
import { catalogPackageDepartures, catalogPackages } from "@/lib/db/schema"
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"
import { PackageGuestBookingForm } from "@/components/packages/package-guest-booking-form"
import { BookingSteps } from "@/components/booking/booking-steps"

async function getBookablePackage(slug: string) {
  const agencyId = await getDefaultAgencyId()
  if (!agencyId) return null
  return withSystemContext(async (db) => {
    const [pkg] = await db
      .select()
      .from(catalogPackages)
      .where(
        and(
          eq(catalogPackages.slug, slug),
          eq(catalogPackages.status, "active"),
          eq(catalogPackages.agencyId, agencyId),
        ),
      )
      .limit(1)
    if (!pkg) return null

    const departuresRaw = await db
      .select()
      .from(catalogPackageDepartures)
      .where(
        and(
          eq(catalogPackageDepartures.packageId, pkg.id),
          eq(catalogPackageDepartures.status, "open"),
          gte(catalogPackageDepartures.departureDate, new Date().toISOString().split("T")[0]!),
        ),
      )
      .orderBy(catalogPackageDepartures.departureDate)

    const departures = departuresRaw
      .map((d) => ({ ...d, seatsLeft: d.totalSeats - d.bookedSeats }))
      .filter((d) => d.seatsLeft > 0)

    return { pkg, departures }
  })
}

export default async function PackageBookPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ departure?: string }>
}) {
  const { slug } = await params
  const { departure } = await searchParams
  const result = await getBookablePackage(slug)
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
            href={`/packages/${pkg.slug}`}
            className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1.5 text-sm"
          >
            <ArrowLeft className="size-4" />
            Retour au voyage
          </Link>
          <h1 className="mb-2 text-2xl font-bold sm:text-3xl">{pkg.title}</h1>
          <p className="text-muted-foreground mb-6">
            Renseignez les voyageurs et choisissez votre mode de règlement.
          </p>
          <BookingSteps current={2} />

          <div className="mt-8">
            <PackageGuestBookingForm
              packageId={pkg.id}
              packageTitle={pkg.title}
              defaultDepartureId={departure && departures.some((d) => d.id === departure) ? departure : undefined}
              departures={departures.map((d) => ({
                id: d.id,
                departureDate: d.departureDate,
                returnDate: d.returnDate,
                seatsLeft: d.seatsLeft,
                adultPriceTnd: parseFloat(d.adultPriceTnd),
                childPriceTnd: d.childPriceTnd ? parseFloat(d.childPriceTnd) : undefined,
              }))}
            />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
