import { redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { BookingTravelersForm } from "@/components/pro/booking-travelers-form"
import { buildBookingContext } from "@/lib/pro/booking-context"
import { getActivePartnerMargins } from "@/lib/pro/server-context"

type BookingSearchParams = {
  hotelId?: string
  offers?: string
  checkin?: string
  checkout?: string
  nights?: string
  adults?: string
  children?: string
}

export const metadata = {
  title: "Réservation — Voyageurs | Espace Pro Easy2Book",
}

export const dynamic = "force-dynamic"

export default async function ProBookingTravelersPage({
  searchParams,
}: {
  searchParams: Promise<BookingSearchParams>
}) {
  const search = await searchParams
  if (!search.hotelId) redirect("/pro")
  // Phase 9 : applique les marges de l'agence sur l'ensemble des prix
  // (subtotal, offers, hotel) du contexte de réservation.
  const margins = await getActivePartnerMargins()
  const context = buildBookingContext(search.hotelId, search.offers, margins)
  if (!context) {
    redirect(`/pro/hotels/${search.hotelId}`)
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-10">
      <div className="mb-4 flex items-center justify-between">
        <Button asChild variant="ghost" size="sm" className="rounded-xl">
          <Link
            href={`/pro/hotels/${context.hotel.id}?checkin=${search.checkin ?? ""}&checkout=${search.checkout ?? ""}`}
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Retour aux chambres
          </Link>
        </Button>
        <span className="text-muted-foreground text-xs tracking-wide uppercase">
          Étape 2 / 3 — Voyageurs &amp; paiement
        </span>
      </div>

      <header className="mb-6">
        <h1 className="text-foreground text-2xl font-bold tracking-tight md:text-3xl">
          Finalisation de la réservation
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Renseignez les voyageurs, appliquez votre coupon éventuel puis
          sélectionnez le mode de paiement.
        </p>
      </header>

      <BookingTravelersForm
        context={context}
        search={{
          checkin: search.checkin,
          checkout: search.checkout,
          nights: search.nights ? Number.parseInt(search.nights, 10) : 4,
          adults: search.adults ? Number.parseInt(search.adults, 10) : 2,
          children: search.children ? Number.parseInt(search.children, 10) : 0,
        }}
      />
    </div>
  )
}
