"use client"

import { Suspense, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { format, parseISO } from "date-fns"
import { fr } from "date-fns/locale"
import { SearchHeader } from "@/components/search-header"
import { FilterSidebar } from "@/components/filter-sidebar"
import { HotelListings } from "@/components/hotel-listings"
import { BookingForm } from "@/components/booking-form"
import { useHotelSearch } from "@/lib/mygo/use-hotel-search"
import {
  applyFilters,
  computeFacets,
  EMPTY_FILTER_STATE,
  type HotelFilterState,
} from "@/lib/mygo/facets"

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
  const searchParams = useSearchParams()
  const [bookingData, setBookingData] = useState<BookingData | null>(null)
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
    setBookingData(hotelData)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const handleBackToSearch = () => {
    setBookingData(null)
  }

  if (bookingData) {
    return <BookingForm hotel={bookingData} onBack={handleBackToSearch} />
  }

  return (
    <div className="min-h-screen bg-background">
      <SearchHeader city={cityName} dateRange={dateRange} paxLabel={paxLabel} />

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="w-full lg:w-1/4 shrink-0">
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
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <HotelSearchContent />
    </Suspense>
  )
}
