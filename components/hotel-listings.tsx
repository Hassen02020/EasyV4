"use client"

import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { differenceInCalendarDays, format, parseISO } from "date-fns"
import { fr } from "date-fns/locale"
import { HotelCard } from "@/components/hotel-card"
import { Skeleton } from "@/components/ui/skeleton"
import type { HotelOfferDTO, HotelSearchResultDTO } from "@/lib/mygo/types"

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

interface HotelListingsProps {
  onBookHotel?: (data: BookingData) => void
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
  const cheapest = allRooms.reduce<typeof allRooms[number] | null>(
    (best, cur) => (best === null || cur.room.price < best.room.price ? cur : best),
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
        room.cancellationPolicies.find((p) => p.nature === "BEFORE_ARRIVAL")?.fromDate ??
        "—",
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

interface SearchState {
  status: "idle" | "loading" | "success" | "error"
  data: HotelSearchResultDTO | null
  error: string | null
}

export function HotelListings({ onBookHotel }: HotelListingsProps) {
  const searchParams = useSearchParams()
  const [state, setState] = useState<SearchState>({
    status: "idle",
    data: null,
    error: null,
  })

  const cityId = searchParams.get("cityId")
  const checkin = searchParams.get("checkin")
  const checkout = searchParams.get("checkout")
  const adults = searchParams.get("adults") ?? "2"
  const children = searchParams.get("children")
  const stars = searchParams.get("stars")
  const onlyAvailable = searchParams.get("onlyAvailable")
  const cityName = searchParams.get("city") ?? "Tunisie"

  const queryString = useMemo(() => {
    if (!cityId || !checkin || !checkout) return null
    const params = new URLSearchParams({ cityId, checkin, checkout, adults })
    if (children) params.set("children", children)
    if (stars) params.set("stars", stars)
    if (onlyAvailable) params.set("onlyAvailable", onlyAvailable)
    return params.toString()
  }, [cityId, checkin, checkout, adults, children, stars, onlyAvailable])

  useEffect(() => {
    if (!queryString) return
    const ctrl = new AbortController()
    fetch(`/api/hotels/search?${queryString}`, { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) {
          const body = (await r.json().catch(() => ({}))) as {
            message?: string
            error?: string
          }
          throw new Error(body.message ?? body.error ?? `HTTP ${r.status}`)
        }
        return r.json() as Promise<HotelSearchResultDTO>
      })
      .then((data) => setState({ status: "success", data, error: null }))
      .catch((err: unknown) => {
        if ((err as { name?: string }).name === "AbortError") return
        setState({
          status: "error",
          data: null,
          error: err instanceof Error ? err.message : "Erreur inconnue",
        })
      })
    return () => ctrl.abort()
  }, [queryString])

  // Initial state: loading if we have a query, error if we don't.
  // Computed at render time to avoid synchronous setState in effect.
  const effectiveStatus: SearchState["status"] =
    state.status === "idle"
      ? queryString
        ? "loading"
        : "error"
      : state.status
  const effectiveError =
    state.error ??
    (state.status === "idle" && !queryString
      ? "Critères de recherche incomplets — retournez à l'accueil."
      : null)

  const handleBookHotel = (
    cardHotel: CardHotelShape,
    mealPlan: string,
    room?: RoomOption,
  ) => {
    if (!onBookHotel || !room || !checkin || !checkout) return
    let nights = 1
    try {
      nights = Math.max(1, differenceInCalendarDays(parseISO(checkout), parseISO(checkin)))
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
      children: children?.split(",").filter(Boolean).length ?? 0,
      pricePerNight: Math.round(room.price / nights),
      totalPrice: room.price,
    })
  }

  const headerSubtitle = useMemo(() => {
    if (!checkin || !checkout) return ""
    try {
      const f = parseISO(checkin)
      const t = parseISO(checkout)
      const nights = Math.max(1, differenceInCalendarDays(t, f))
      return `${format(f, "d MMM", { locale: fr })} - ${format(t, "d MMM yyyy", { locale: fr })} · ${nights} nuit${nights > 1 ? "s" : ""} · ${adults} adulte${Number(adults) > 1 ? "s" : ""}`
    } catch {
      return ""
    }
  }, [checkin, checkout, adults])

  const cardHotels = useMemo(
    () => (state.data?.offers ?? []).map(toCardShape),
    [state.data],
  )

  if (effectiveStatus === "loading") {
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

  if (effectiveStatus === "error") {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
        Erreur de recherche : {effectiveError ?? "inconnue"}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">
            {state.data?.count ?? 0} hôtel{(state.data?.count ?? 0) > 1 ? "s" : ""} à {cityName}
          </h1>
          {headerSubtitle && (
            <p className="text-sm text-muted-foreground">{headerSubtitle}</p>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {cardHotels.length === 0 && (
          <div className="rounded-lg border border-border p-6 text-sm text-muted-foreground">
            Aucun hôtel disponible sur ces dates pour ce critère.
          </div>
        )}
        {cardHotels.map((hotel) => (
          <HotelCard
            key={hotel.id}
            hotel={hotel}
            onBook={(mealPlan, room) => handleBookHotel(hotel, mealPlan, room)}
          />
        ))}
      </div>
    </div>
  )
}
