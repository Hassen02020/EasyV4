/**
 * SERP Hôtels du portail B2B.
 *
 *  - Server Component : lit les `searchParams`, filtre le catalogue local,
 *    délègue à `HotelsSerp` (client) pour les filtres latéraux + sort.
 *  - Les données viennent de `lib/pro/hotels-fixture.ts` ; elles seront
 *    remplacées par un appel MyGo (`/api/hotels/search`) en Phase 9 quand
 *    on branchera la marge dynamique et les vraies disponibilités.
 */

import { findDestinationById } from "@/lib/pro/destinations"
import { listProHotels } from "@/lib/pro/hotels-fixture"
import { applyMarginsToHotel } from "@/lib/pro/pricing"
import { getActivePartnerMargins } from "@/lib/pro/server-context"
import { HotelsSerp } from "@/components/pro/hotels-serp"

export const metadata = {
  title: "Résultats hôtels — Espace Pro Easy2Book",
  description: "Liste des hôtels disponibles via le portail B2B Easy2Book",
}

export const dynamic = "force-dynamic"

type SerpSearchParams = {
  module?: string
  destination?: string
  destinationLabel?: string
  cityId?: string
  checkin?: string
  checkout?: string
  nights?: string
  rooms?: string
  adults?: string
  children?: string
}

export default async function ProHotelsSerpPage({
  searchParams,
}: {
  searchParams: Promise<SerpSearchParams>
}) {
  const params = await searchParams
  const destination = params.destination
    ? findDestinationById(params.destination)
    : undefined

  const cityIdParam =
    params.cityId && /^\d+$/.test(params.cityId)
      ? Number.parseInt(params.cityId, 10)
      : destination?.cityId

  const baseHotels = listProHotels({
    cityId: destination?.kind === "city" ? cityIdParam : undefined,
    brand: destination?.kind === "chain" ? destination.label : undefined,
    searchAll: destination?.kind === "all" || destination?.kind === "region",
  })

  // Phase 9 : applique la marge `hotel` configurée pour l'agence partenaire
  // courante sur chaque prix net de pension affiché.
  const margins = await getActivePartnerMargins()
  const hotels = baseHotels.map((h) => applyMarginsToHotel(h, margins))

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-10">
      <HotelsSerp
        hotels={hotels}
        context={{
          destinationLabel:
            params.destinationLabel ??
            destination?.label ??
            "Toute la Tunisie",
          checkin: params.checkin,
          checkout: params.checkout,
          nights: params.nights ? Number.parseInt(params.nights, 10) : undefined,
          rooms: params.rooms ? Number.parseInt(params.rooms, 10) : 1,
          adults: params.adults ? Number.parseInt(params.adults, 10) : 2,
          children: params.children ? Number.parseInt(params.children, 10) : 0,
        }}
      />
    </div>
  )
}
