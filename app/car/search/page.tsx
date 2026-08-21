/**
 * Résultats de recherche Location de Voiture — /car/search
 *
 * Même structure que app/transferts/resultats/page.tsx : Server Component
 * qui résout l'agence "OTA directe" (flotte Easy2Book, voir app/car/page.tsx)
 * et charge le catalogue réel (lieux + catégories), puis affiche
 * `CarBookingForm` pré-rempli — le devis lui-même (et sa mise à jour en
 * direct si la catégorie/l'assurance change) passe par
 * `calculateCarPrice` (lib/cars/pricing.ts), jamais un prix par défaut.
 *
 * Route manquante identifiée à l'audit : `CarSearch` naviguait déjà vers
 * `/car/search`, qui n'existait pas — chaque recherche se terminait en 404.
 */

import Link from "next/link"
import { AlertTriangle } from "lucide-react"
import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { CarBookingForm } from "@/components/car/car-booking-form"
import { withSystemContext } from "@/lib/db/tenant-context"
import { carLocations, carCategories } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Votre devis de location | Easy2Book",
}

interface SearchParams {
  pickup?: string
  dropoff?: string
  pickupDate?: string
  pickupTime?: string
  returnDate?: string
  returnTime?: string
  category?: string
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-16">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Devis indisponible</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
        <Button asChild className="mt-6">
          <Link href="/car">Refaire une recherche</Link>
        </Button>
      </main>
      <Footer />
    </div>
  )
}

export default async function CarResultsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const { pickup, dropoff, pickupDate, pickupTime, returnDate, returnTime, category } =
    await searchParams

  if (!pickup || !dropoff || !pickupDate || !pickupTime || !returnDate || !returnTime) {
    return <ErrorState message="Critères de recherche incomplets. Merci de refaire votre recherche." />
  }
  if (`${returnDate}T${returnTime}` <= `${pickupDate}T${pickupTime}`) {
    return <ErrorState message="La date/heure de retour doit être après la prise en charge." />
  }

  const agencyId = await getDefaultAgencyId()
  if (!agencyId) {
    return <ErrorState message="Aucune agence de vente directe n'est configurée pour le moment." />
  }

  const [locations, categories] = await Promise.all([
    withSystemContext((db) =>
      db
        .select()
        .from(carLocations)
        .where(and(eq(carLocations.agencyId, agencyId), eq(carLocations.status, "active")))
        .orderBy(carLocations.name),
    ),
    withSystemContext((db) =>
      db
        .select()
        .from(carCategories)
        .where(and(eq(carCategories.agencyId, agencyId), eq(carCategories.status, "active")))
        .orderBy(carCategories.name),
    ),
  ])

  const pickupLocation = locations.find((l) => l.id === pickup)
  const dropoffLocation = locations.find((l) => l.id === dropoff)
  if (!pickupLocation || !dropoffLocation) {
    return <ErrorState message="Lieu de prise en charge ou de retour introuvable. Merci de refaire votre recherche." />
  }

  if (categories.length === 0) {
    return (
      <ErrorState message="Aucune catégorie de véhicule n'est encore configurée pour cette flotte. Revenez bientôt." />
    )
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 bg-muted/30">
        <div className="bg-gradient-to-br from-orange-900 to-orange-700 px-4 py-10 text-white">
          <div className="mx-auto max-w-4xl text-center">
            <p className="mb-2 text-sm font-medium tracking-widest text-orange-300 uppercase">
              Votre location
            </p>
            <h1 className="text-2xl font-bold md:text-3xl">
              {pickupLocation.name}
              {dropoffLocation.id !== pickupLocation.id ? ` → ${dropoffLocation.name}` : ""}
            </h1>
          </div>
        </div>

        <div className="mx-auto max-w-4xl px-4 py-10">
          <CarBookingForm
            agencyId={agencyId}
            locations={locations}
            categories={categories}
            prefill={{
              pickupLocationId: pickup,
              dropoffLocationId: dropoff,
              categoryId: categories.find((c) => c.id === category)?.id ?? categories[0]!.id,
              pickupDate,
              pickupTime,
              returnDate,
              returnTime,
            }}
          />
        </div>
      </main>
      <Footer />
    </div>
  )
}
