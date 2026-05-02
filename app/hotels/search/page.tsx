"use client"

import { Suspense, useState } from "react"
import { useSearchParams } from "next/navigation"
import { format, parseISO } from "date-fns"
import { fr } from "date-fns/locale"
import { SearchHeader } from "@/components/search-header"
import { FilterSidebar } from "@/components/filter-sidebar"
import { HotelListings } from "@/components/hotel-listings"
import { BookingForm } from "@/components/booking-form"

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

  const city = searchParams.get("city") ?? "Hammamet"
  const checkin = searchParams.get("checkin")
  const checkout = searchParams.get("checkout")
  const adults = Number(searchParams.get("adults") ?? "2")
  const children = searchParams.get("children")?.split(",").filter(Boolean).length ?? 0

  const dateRange = formatDateRange(checkin, checkout)
  const paxLabel =
    children > 0
      ? `${adults} Adulte${adults > 1 ? "s" : ""}, ${children} Enfant${children > 1 ? "s" : ""}`
      : `${adults} Adulte${adults > 1 ? "s" : ""}`

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
      <SearchHeader city={city} dateRange={dateRange} paxLabel={paxLabel} />

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="w-full lg:w-1/4 shrink-0">
            <FilterSidebar />
          </div>

          <div className="flex-1">
            <HotelListings onBookHotel={handleBookHotel} />
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
