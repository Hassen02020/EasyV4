"use client"

import { useMemo } from "react"
import { useRouter } from "next/navigation"
import { differenceInCalendarDays, format, parseISO } from "date-fns"
import { fr } from "date-fns/locale"
import { HotelCard } from "@/components/hotel-card"
import { Skeleton } from "@/components/ui/skeleton"
import type { HotelOfferDTO } from "@/lib/mygo/types"

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

interface RoomOption {
  id: number
  name: string
  freeCancellationDate: string
  available: boolean
  price: number
}

interface CardHotelShape {
  id: number
  name: string
  location: string
  rating: number
  stars: number
  amenities: string[]
  tags: string[]
  originalPrice: number
  discountedPrice: number
  discountPercent: number
  images: string[]
  mealPlan: string
  mealOptions?: string[]
  rooms?: RoomOption[]
}

const PLACEHOLDER_IMG =
  "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600&h=400&fit=crop"

/** Convertit une offre myGo en data attendu par la card existante. */
function toCardShape(offer: HotelOfferDTO): CardHotelShape {
  const h = offer.hotel
  const allRooms = offer.boardings.flatMap((b) =>
    b.pax.flatMap((p) =>
      p.rooms.map((r) => ({
        boardName: b.name,
        room: r,
      })),
    ),
  )
  const cheapest = allRooms.reduce<(typeof allRooms)[number] | null>(
    (best, cur) =>
      best === null || cur.room.price < best.room.price ? cur : best,
    null,
  )
  const mealPlan = cheapest?.boardName ?? offer.boardings[0]?.name ?? "—"
  const mealOptions = Array.from(new Set(offer.boardings.map((b) => b.name)))

  const rooms: RoomOption[] = allRooms
    .filter((r) => !r.room.stopReservation)
    .slice(0, 6)
    .map(({ room, boardName }) => ({
      id: room.id,
      name: `${room.name} • ${boardName}`,
      freeCancellationDate:
        room.cancellationPolicies.find((p) => p.nature === "BEFORE_ARRIVAL")
          ?.fromDate ?? "—",
      available: !room.stopReservation,
      price: Math.round(room.price),
    }))

  const images = h.image ? [h.image] : [PLACEHOLDER_IMG]
  const stars = h.stars ?? 0
  const tags: string[] = []
  if (offer.recommended) tags.push("Recommandé")
  for (const t of (h.themes ?? []).slice(0, 3)) tags.push(t)

  const amenities: string[] = []
  for (const f of h.facilities.slice(0, 4)) {
    if (f.title) amenities.push(f.title)
  }

  return {
    id: h.id,
    name: h.name,
    location: [h.cityName, h.region].filter(Boolean).join(", ") || "Tunisie",
    rating: stars,
    stars,
    amenities,
    tags,
    originalPrice: Math.round(offer.fromPrice),
    discountedPrice: Math.round(offer.fromPrice),
    discountPercent: 0,
    images,
    mealPlan,
    mealOptions,
    rooms,
  }
}

interface HotelListingsProps {
  /** Offres déjà filtrées prêtes à afficher. */
  offers: HotelOfferDTO[]
  /** Total brut (avant filtrage) — pour le header "X hôtels à Y". */
  totalCount: number
  /** Devise affichée (passée par la page parente, par défaut TND). */
  currency?: string
  status: "loading" | "success" | "error"
  error?: string | null
  cityName: string
  checkin: string | null
  checkout: string | null
  adults: string
  /** Âges enfants en CSV (ex. "5,8"), tel quel depuis l'URL. */
  childrenAges: string | null
  onBookHotel?: (data: BookingData) => void
}

export function HotelListings({
  offers,
  totalCount,
  currency = "TND",
  status,
  error,
  cityName,
  checkin,
  checkout,
  adults,
  childrenAges,
  onBookHotel,
}: HotelListingsProps) {
  const router = useRouter()

  const handleBookHotel = (
    cardHotel: CardHotelShape,
    mealPlan: string,
    room?: RoomOption,
  ) => {
    if (!onBookHotel || !room || !checkin || !checkout) return
    let nights = 1
    try {
      nights = Math.max(
        1,
        differenceInCalendarDays(parseISO(checkout), parseISO(checkin)),
      )
    } catch {
      nights = 1
    }
    onBookHotel({
      id: cardHotel.id,
      name: cardHotel.name,
      location: cardHotel.location,
      image: cardHotel.images[0],
      roomType: room.name,
      mealPlan,
      checkIn: checkin,
      checkOut: checkout,
      nights,
      adults: Number(adults),
      children: childrenAges?.split(",").filter(Boolean).length ?? 0,
      pricePerNight: Math.round(room.price / nights),
      totalPrice: room.price,
    })
  }

  const handleViewDetails = (hotelId: number) => {
    const params = new URLSearchParams()
    if (checkin) params.set("checkin", checkin)
    if (checkout) params.set("checkout", checkout)
    if (adults) params.set("adults", adults)
    if (childrenAges) params.set("children", childrenAges)
    const qs = params.toString()
    router.push(`/hotels/${hotelId}${qs ? `?${qs}` : ""}`)
  }

  const headerSubtitle = useMemo(() => {
    if (!checkin || !checkout) return ""
    try {
      const f = parseISO(checkin)
      const t = parseISO(checkout)
      const nights = Math.max(1, differenceInCalendarDays(t, f))
      const childCount = childrenAges?.split(",").filter(Boolean).length ?? 0
      const paxLabel =
        childCount > 0
          ? `${adults} adulte${Number(adults) > 1 ? "s" : ""}, ${childCount} enfant${childCount > 1 ? "s" : ""}`
          : `${adults} adulte${Number(adults) > 1 ? "s" : ""}`
      return `${format(f, "d MMM", { locale: fr })} - ${format(t, "d MMM yyyy", { locale: fr })} · ${nights} nuit${nights > 1 ? "s" : ""} · ${paxLabel}`
    } catch {
      return ""
    }
  }, [checkin, checkout, adults, childrenAges])

  const cardHotels = useMemo(() => offers.map(toCardShape), [offers])

  if (status === "loading") {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-48" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-56 w-full" />
        ))}
      </div>
    )
  }

  if (status === "error") {
    return (
      <div className="border-destructive/40 bg-destructive/5 text-destructive rounded-lg border p-6 text-sm">
        Erreur de recherche : {error ?? "inconnue"}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-foreground text-xl font-bold">
            {totalCount} hôtel{totalCount > 1 ? "s" : ""} à {cityName}
            {offers.length !== totalCount && (
              <span className="text-muted-foreground ml-2 text-sm font-normal">
                ({offers.length} après filtrage)
              </span>
            )}
          </h1>
          {headerSubtitle && (
            <p className="text-muted-foreground text-sm">{headerSubtitle}</p>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {cardHotels.length === 0 && (
          <div className="border-border text-muted-foreground rounded-lg border p-6 text-sm">
            Aucun hôtel ne correspond aux filtres sélectionnés.
          </div>
        )}
        {cardHotels.map((hotel) => (
          <HotelCard
            key={hotel.id}
            hotel={hotel}
            currency={currency}
            onBook={(mealPlan, room) => handleBookHotel(hotel, mealPlan, room)}
            onViewDetails={() => handleViewDetails(hotel.id)}
          />
        ))}
      </div>
    </div>
  )
}
