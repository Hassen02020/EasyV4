/**
 * Résultats de recherche Transferts — /transferts/resultats
 *
 * Server Component : résout les zones + le tarif réel (catalog_transfer_pricing)
 * pour l'itinéraire demandé, puis affiche le devis et le formulaire de
 * réservation pré-rempli. N'affiche jamais de prix par défaut/inventé :
 * si aucun tarif n'est configuré pour cet itinéraire + véhicule, on le dit.
 */

import Link from "next/link"
import { AlertTriangle } from "lucide-react"
import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { TransferBookingForm } from "@/components/transfer/transfer-booking-form"
import { getDb } from "@/lib/db/client"
import { catalogTransferZones, transferVehicleType } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { calculateTransferPrice } from "@/lib/transfers/pricing"
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Votre devis de transfert | Easy2Book",
}

interface SearchParams {
  from?: string
  to?: string
  vehicle?: string
  date?: string
  time?: string
  pax?: string
}

const VEHICLE_VALUES = new Set<string>(transferVehicleType.enumValues)

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
          <Link href="/transferts">Refaire une recherche</Link>
        </Button>
      </main>
      <Footer />
    </div>
  )
}

export default async function TransferResultsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const { from, to, vehicle, date, time, pax } = await searchParams

  if (!from || !to || !vehicle || !date || !time) {
    return (
      <ErrorState message="Critères de recherche incomplets. Merci de refaire votre recherche." />
    )
  }
  if (!VEHICLE_VALUES.has(vehicle)) {
    return <ErrorState message="Type de véhicule invalide." />
  }
  const vehicleType = vehicle as (typeof transferVehicleType.enumValues)[number]
  const paxCount = pax ? Math.max(1, Math.min(50, Number(pax) || 1)) : 2

  const agencyId = await getDefaultAgencyId()
  if (!agencyId) {
    return (
      <ErrorState message="Aucune agence de vente directe n'est configurée pour le moment." />
    )
  }

  const db = getDb()
  const zones = await db
    .select()
    .from(catalogTransferZones)
    .where(eq(catalogTransferZones.status, "active"))
    .orderBy(catalogTransferZones.name)

  const fromZone = zones.find((z) => z.id === from)
  const toZone = zones.find((z) => z.id === to)
  if (!fromZone || !toZone) {
    return (
      <ErrorState message="Zone de départ ou d'arrivée introuvable. Merci de refaire votre recherche." />
    )
  }

  const pricing = await calculateTransferPrice({
    fromZoneId: from,
    toZoneId: to,
    vehicleType,
    pickupDate: date,
    pickupTime: time,
    agencyId,
  })

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 bg-muted/30">
        <div className="bg-gradient-to-br from-blue-900 to-blue-700 px-4 py-10 text-white">
          <div className="mx-auto max-w-4xl text-center">
            <p className="mb-2 text-sm font-medium tracking-widest text-blue-300 uppercase">
              Votre trajet
            </p>
            <h1 className="text-2xl font-bold md:text-3xl">
              {fromZone.name} → {toZone.name}
            </h1>
          </div>
        </div>

        <div className="mx-auto max-w-4xl px-4 py-10">
          {!pricing ? (
            <Alert variant="destructive" className="mb-8">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Aucun tarif configuré</AlertTitle>
              <AlertDescription>
                Cet itinéraire n&apos;est pas encore tarifé pour ce type de
                véhicule. Essayez un autre véhicule ou contactez-nous
                directement.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert className="mb-8 border-emerald-200 bg-emerald-50 text-emerald-900">
              <AlertTitle>Devis : {pricing.totalTnd.toFixed(3)} DT</AlertTitle>
              <AlertDescription className="text-emerald-800">
                Prix de base {pricing.basePriceTnd.toFixed(3)} DT
                {pricing.nightSurchargeAmount > 0 &&
                  ` + majoration nuit ${pricing.nightSurchargeAmount.toFixed(3)} DT`}
                . Finalisez votre réservation ci-dessous.
              </AlertDescription>
            </Alert>
          )}

          <TransferBookingForm
            zones={zones}
            agencyId={agencyId}
            prefill={{
              fromZoneId: from,
              toZoneId: to,
              vehicleType,
              pickupDate: date,
              pickupTime: time,
              pax: paxCount,
            }}
          />
        </div>
      </main>
      <Footer />
    </div>
  )
}
