import { redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { BookingTravelersForm } from "@/components/pro/booking-travelers-form"
import { ProBookingTravelersForm } from "@/components/pro/pro-booking-travelers-form"
import { buildBookingContext } from "@/lib/pro/booking-context"
import { getActivePartnerMargins } from "@/lib/pro/server-context"
import {
  HotelSearchQuerySchema,
  runHotelSearch,
} from "@/lib/mygo/search-core"
import { applyMarginToHotelOffer } from "@/lib/pro/pricing"
import { matchSelectedRoom } from "@/lib/booking/room-match"

type BookingSearchParams = {
  hotelId?: string
  offers?: string
  checkin?: string
  checkout?: string
  nights?: string
  adults?: string
  children?: string
  // Chemin myGo réel (Phase 9) — présence de myGoToken distingue ce chemin
  // de l'ancien chemin fixture (`offers`, ci-dessus).
  cityId?: string
  boardingId?: string
  boardingCode?: string
  roomId?: string
  myGoToken?: string
}

export const metadata = {
  title: "Réservation — Voyageurs | Espace Pro Easy2Book",
}

export const dynamic = "force-dynamic"

function UnavailableState({ hotelId, checkin, checkout }: { hotelId: string; checkin?: string; checkout?: string }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <div className="border-destructive/40 bg-destructive/5 text-destructive rounded-2xl border p-8 text-center text-sm">
        <p className="font-semibold">
          Cette chambre n&apos;est plus disponible au tarif sélectionné
        </p>
        <p className="mt-1">
          Le prix ou la disponibilité ont changé depuis votre recherche.
          Merci de choisir une nouvelle chambre.
        </p>
        <Button asChild variant="outline" className="mt-4 rounded-xl">
          <Link href={`/pro/hotels/${hotelId}?checkin=${checkin ?? ""}&checkout=${checkout ?? ""}`}>
            Retour aux chambres
          </Link>
        </Button>
      </div>
    </div>
  )
}

export default async function ProBookingTravelersPage({
  searchParams,
}: {
  searchParams: Promise<BookingSearchParams>
}) {
  const search = await searchParams
  if (!search.hotelId) redirect("/pro")

  // --- Chemin myGo réel (Phase 9) ---
  if (search.myGoToken) {
    if (
      !search.cityId ||
      !search.checkin ||
      !search.checkout ||
      !search.boardingId ||
      !search.roomId
    ) {
      return <UnavailableState hotelId={search.hotelId} checkin={search.checkin} checkout={search.checkout} />
    }

    const parsed = HotelSearchQuerySchema.safeParse({
      cityId: search.cityId,
      checkin: search.checkin,
      checkout: search.checkout,
      adults: search.adults,
      children: search.children,
      hotelId: search.hotelId,
    })
    if (!parsed.success) {
      return <UnavailableState hotelId={search.hotelId} checkin={search.checkin} checkout={search.checkout} />
    }

    const q = parsed.data
    // Re-recherche à cet instant précis — sert de première revalidation
    // (prix/dispo rafraîchis par rapport au moment du clic "Suivant" sur la
    // page de sélection de chambre) ; la revalidation finale et autoritaire
    // reste BookingCreation lui-même, exécuté par createReservationFromDraft
    // (inchangé) au moment de la confirmation.
    const [result, margins] = await Promise.all([
      runHotelSearch(q),
      getActivePartnerMargins(),
    ])

    const rawOffer = result.ok ? result.dto.offers[0] : null
    const boardingIdNum = Number(search.boardingId)
    const roomIdNum = Number(search.roomId)
    const matchedRoom = rawOffer ? matchSelectedRoom(rawOffer, boardingIdNum, roomIdNum) : null

    if (!rawOffer || !matchedRoom) {
      return <UnavailableState hotelId={search.hotelId} checkin={search.checkin} checkout={search.checkout} />
    }

    const offer = applyMarginToHotelOffer(rawOffer, margins)
    const marginedRoom = offer.boardings
      .find((b) => b.id === boardingIdNum)
      ?.pax.flatMap((p) => p.rooms)
      .find((r) => r.id === roomIdNum)
    const priceTnd = marginedRoom?.price ?? matchedRoom.room.price

    const childrenAges = (search.children ?? "")
      .split(",")
      .map((a) => Number.parseInt(a, 10))
      .filter((n) => Number.isFinite(n) && n >= 0 && n <= 17)

    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-10">
        <div className="mb-4 flex items-center justify-between">
          <Button asChild variant="ghost" size="sm" className="rounded-xl">
            <Link href={`/pro/hotels/${search.hotelId}?cityId=${q.cityId}&checkin=${q.checkin}&checkout=${q.checkout}&adults=${q.adults}`}>
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Retour aux chambres
            </Link>
          </Button>
          <span className="text-muted-foreground text-xs tracking-wide uppercase">
            Étape 2 / 2 — Voyageur &amp; confirmation
          </span>
        </div>

        <header className="mb-6">
          <h1 className="text-foreground text-2xl font-bold tracking-tight md:text-3xl">
            Finalisation de la réservation
          </h1>
        </header>

        <ProBookingTravelersForm
          hotelName={offer.hotel.name}
          roomName={matchedRoom.room.name}
          boardingName={matchedRoom.boarding.name}
          priceTnd={priceTnd}
          currency={offer.currency}
          checkin={q.checkin}
          checkout={q.checkout}
          adults={q.adults}
          childrenCount={childrenAges.length}
          childrenAges={childrenAges}
          providerMeta={{
            myGoToken: offer.token,
            cityId: q.cityId,
            hotelId: offer.hotel.id,
            boardingId: matchedRoom.boarding.id,
            boardingCode: matchedRoom.boarding.code,
            roomId: matchedRoom.room.id,
          }}
        />
      </div>
    )
  }

  // --- Chemin fixture (hérité, non touché) ---
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
