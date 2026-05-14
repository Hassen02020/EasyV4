"use client"

import { Suspense, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { format, parseISO } from "date-fns"
import { fr } from "date-fns/locale"
import { SearchHeader } from "@/components/search-header"
import { FilterSidebar } from "@/components/filter-sidebar"
import { HotelListings } from "@/components/hotel-listings"
import { useHotelSearch } from "@/lib/mygo/use-hotel-search"
import {
  applyFilters,
  computeFacets,
  EMPTY_FILTER_STATE,
  type HotelFilterState,
} from "@/lib/mygo/facets"
import { encodeDraft } from "@/lib/booking/draft-store"

interface BookingData {
  id: number
  name: string
  location: string
  image: string
  roomType: string
  mealPlan: string
  checkIn: string
  checkOut: string
  nights: number
  adults: number
  children: number
  pricePerNight: number
  totalPrice: number
}

function formatDateRange(checkin: string | null, checkout: string | null) {
  if (!checkin || !checkout) return "Sélectionner les dates"
  try {
    const from = parseISO(checkin)
    const to = parseISO(checkout)
    return `${format(from, "dd MMM", { locale: fr })} - ${format(to, "dd MMM yyyy", { locale: fr })}`
  } catch {
    return "Sélectionner les dates"
  }
}

function HotelSearchContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [filters, setFilters] = useState<HotelFilterState>(EMPTY_FILTER_STATE)

  const { status, data, error } = useHotelSearch()

  const cityName = searchParams.get("city") ?? "Hammamet"
  const checkin = searchParams.get("checkin")
  const checkout = searchParams.get("checkout")
  const adultsStr = searchParams.get("adults") ?? "2"
  const adults = Number(adultsStr)
  const childrenStr = searchParams.get("children")
  const children = childrenStr?.split(",").filter(Boolean).length ?? 0

  const dateRange = formatDateRange(checkin, checkout)
  const paxLabel =
    children > 0
      ? `${adults} Adulte${adults > 1 ? "s" : ""}, ${children} Enfant${children > 1 ? "s" : ""}`
      : `${adults} Adulte${adults > 1 ? "s" : ""}`

  const allOffers = useMemo(() => data?.offers ?? [], [data])
  const currency = data?.offers?.[0]?.currency ?? "TND"

  const facets = useMemo(
    () => (allOffers.length > 0 ? computeFacets(allOffers) : null),
    [allOffers],
  )

  const filteredOffers = useMemo(
    () => applyFilters(allOffers, filters),
    [allOffers, filters],
  )

  const handleBookHotel = (hotelData: BookingData) => {
    const unitPriceTnd =
      hotelData.adults > 0
        ? hotelData.totalPrice / hotelData.adults
        : hotelData.totalPrice
    const token = encodeDraft({
      draft: {
        module: "hotel",
        offerId: String(hotelData.id),
        offerLabel: `${hotelData.name} — ${hotelData.roomType}`,
        startDate: hotelData.checkIn,
        endDate: hotelData.checkOut,
        adults: hotelData.adults,
        children: hotelData.children,
        unitPriceTnd,
        currency: "TND",
        metadata: {
          hotelImage: hotelData.image,
          mealPlan: hotelData.mealPlan,
          nights: hotelData.nights,
          location: hotelData.location,
        },
      },
    })
    router.push(`/booking?d=${encodeURIComponent(token)}`)
  }

  return (
    <div className="bg-background min-h-screen">
      <SearchHeader city={cityName} dateRange={dateRange} paxLabel={paxLabel} />

      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="w-full shrink-0 lg:w-1/4">
            <FilterSidebar
              facets={facets}
              state={filters}
              onChange={setFilters}
              currency={currency}
              disabled={status !== "success"}
            />
          </div>

          <div className="flex-1">
            <HotelListings
              offers={filteredOffers}
              totalCount={data?.count ?? 0}
              currency={currency}
              status={status}
              error={error}
              cityName={cityName}
              checkin={checkin}
              checkout={checkout}
              adults={adultsStr}
              childrenAges={childrenStr}
              onBookHotel={handleBookHotel}
            />
          </div>
        </div>
      </main>
    </div>
  )
}

export default function HotelSearchPage() {
  return (
    <Suspense fallback={<div className="bg-background min-h-screen" />}>
      <HotelSearchContent />
    </Suspense>
  )
}
