import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { getProHotelById } from "@/lib/pro/hotels-fixture"
import { listRoomOffers } from "@/lib/pro/rooms"
import { Button } from "@/components/ui/button"
import { HotelSummaryCard } from "@/components/pro/hotel-summary-card"
import { HotelRoomSelector } from "@/components/pro/hotel-room-selector"

type DetailSearchParams = {
  checkin?: string
  checkout?: string
  nights?: string
  rooms?: string
  adults?: string
  children?: string
}

export const dynamic = "force-dynamic"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const hotel = getProHotelById(id)
  return {
    title: hotel ? `${hotel.name} — Espace Pro Easy2Book` : "Hôtel introuvable",
  }
}

export default async function ProHotelDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<DetailSearchParams>
}) {
  const { id } = await params
  const search = await searchParams
  const hotel = getProHotelById(id)
  if (!hotel) notFound()

  const offers = listRoomOffers(hotel)

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-10">
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm" className="rounded-xl">
          <Link href="/pro/hotels">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Retour aux résultats
          </Link>
        </Button>
      </div>

      <div className="space-y-5">
        <HotelSummaryCard hotel={hotel} />

        <HotelRoomSelector
          hotel={hotel}
          offers={offers}
          context={{
            checkin: search.checkin,
            checkout: search.checkout,
            nights: search.nights ? Number.parseInt(search.nights, 10) : 4,
            rooms: search.rooms ? Number.parseInt(search.rooms, 10) : 1,
            adults: search.adults ? Number.parseInt(search.adults, 10) : 2,
            children: search.children
              ? Number.parseInt(search.children, 10)
              : 0,
          }}
        />
      </div>
    </div>
  )
}
