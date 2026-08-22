"use client"

import { useMemo } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { differenceInCalendarDays, format, parseISO } from "date-fns"
import { fr } from "date-fns/locale"
import { HotelCard } from "@/components/hotel-card"
import { Skeleton } from "@/components/ui/skeleton"
import type { HotelOfferDTO } from "@/lib/mygo/types"
import { selectBestRate } from "@/lib/mygo/best-rate"

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
  /** Champs fournisseur myGo — nécessaires pour BookingCreation (voir handleBookHotel). */
  myGoToken: string
  cityId?: number
  boardingId: number
  boardingCode: string
  roomId: number
}

/**
 * Statut d'annulation honnête, dérivé de `RoomOfferDTO.notRefundable` +
 * `cancellationPolicies` (déjà normalisés par myGo, jamais fabriqués) :
 *   - "free"          : au moins une politique BEFORE_ARRIVAL sans frais —
 *                        annulation gratuite avant `beforeDate`.
 *   - "non_refundable": `notRefundable === true` côté fournisseur.
 *   - "unknown"        : ni l'un ni l'autre — myGo n'a communiqué aucune
 *                        politique exploitable, on ne l'invente pas.
 */
type CancellationStatus =
  | { kind: "free"; beforeDate: string }
  | { kind: "non_refundable" }
  | { kind: "unknown" }

interface RoomOption {
  id: number
  name: string
  cancellation: CancellationStatus
  available: boolean
  price: number
  /** Id/code myGo du Boarding auquel appartient cette chambre — requis pour BookingCreation. */
  boardingId?: number
  boardingCode?: string
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
  /** Prix/nuit dérivé de `discountedPrice / nights` — `undefined` si le nombre de nuits n'est pas connu (pas de dates valides). */
  pricePerNight?: number
  /** Token myGo de l'offre (HotelSearch) — à renvoyer dans BookingCreation. */
  myGoToken: string
  cityId?: number
}

const PLACEHOLDER_IMG =
  "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600&h=400&fit=crop"

/**
 * Convertit une offre myGo en data attendu par la card existante.
 *
 * Best Rate Engine : si des types de pension sont activement filtrés
 * (`activeBoardings`, ex. "All Inclusive"), le prix/pension affiché sur la
 * card bascule sur le moins cher PARMI les pensions filtrées plutôt que sur
 * le moins cher toutes pensions confondues — ex. si le moins cher global est
 * en Petit-déjeuner à 250 mais qu'on filtre "All Inclusive" et que la
 * chambre All Inclusive la moins chère est à 380, la card affiche 380 (le
 * vrai prix pour ce que l'utilisateur a demandé), pas 250.
 */
/** Dérive un statut d'annulation honnête depuis les données myGo — jamais un badge par défaut fabriqué. */
function cancellationStatusFor(room: {
  notRefundable: boolean
  cancellationPolicies: { nature: string; fees: number; fromDate?: string }[]
}): CancellationStatus {
  if (room.notRefundable) return { kind: "non_refundable" }
  const freePolicy = room.cancellationPolicies.find(
    (p) => p.nature === "BEFORE_ARRIVAL" && p.fees === 0 && p.fromDate,
  )
  if (freePolicy?.fromDate) return { kind: "free", beforeDate: freePolicy.fromDate }
  return { kind: "unknown" }
}

function toCardShape(
  offer: HotelOfferDTO,
  activeBoardings: string[] = [],
  nights?: number,
): CardHotelShape {
  const h = offer.hotel
  const allRooms = offer.boardings.flatMap((b) =>
    b.pax.flatMap((p, groupIndex) =>
      p.rooms.map((r) => ({
        boarding: b,
        room: r,
        groupIndex,
      })),
    ),
  )

  const bestRate = selectBestRate(offer, activeBoardings)
  const mealPlan = bestRate?.boardingName ?? offer.boardings[0]?.name ?? "—"
  const mealOptions = Array.from(new Set(offer.boardings.map((b) => b.name)))

  // Nombre de "chambres" réellement demandées à myGo (recherche
  // multi-chambres, voir HotelSearchInput.rooms) — > 1 quand plusieurs
  // groupes pax existent sur au moins une pension.
  const roomGroupCount = Math.max(
    1,
    ...offer.boardings.map((b) => b.pax.length),
  )

  const rooms: RoomOption[] = allRooms
    .filter((r) => !r.room.stopReservation)
    .slice(0, 8)
    .map(({ room, boarding, groupIndex }) => ({
      id: room.id,
      name:
        roomGroupCount > 1
          ? `${room.name} • ${boarding.name} (Chambre ${groupIndex + 1})`
          : `${room.name} • ${boarding.name}`,
      cancellation: cancellationStatusFor(room),
      available: !room.stopReservation,
      price: Math.round(room.price),
      boardingId: boarding.id,
      boardingCode: boarding.code,
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

  // Prix affiché = celui du "meilleur tarif" retenu ci-dessus (déjà
  // conscient du filtre de pension actif), pas systématiquement le prix
  // brut le plus bas de l'offre — voir le commentaire Best Rate Engine.
  const displayPrice = Math.round(bestRate?.price ?? offer.fromPrice)

  return {
    id: h.id,
    name: h.name,
    location: [h.cityName, h.region].filter(Boolean).join(", ") || "Tunisie",
    rating: stars,
    stars,
    amenities,
    tags,
    originalPrice: displayPrice,
    discountedPrice: displayPrice,
    discountPercent: 0,
    images,
    mealPlan,
    mealOptions,
    rooms,
    pricePerNight:
      nights && nights > 0 ? Math.round(displayPrice / nights) : undefined,
    myGoToken: offer.token,
    cityId: h.cityId,
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
  /** Code machine de l'erreur (`service_unavailable`, `rate_limited`,
   * `auth_failed`, `internal`, `incomplete_query`…) — affiche un message et
   * une action adaptés plutôt qu'un texte générique unique. */
  errorCode?: string | null
  /** Résultat servi en mode dégradé (panne fournisseur, cache figé). */
  degraded?: boolean
  /** Résultat servi depuis un cache déjà périmé mais encore affichable. */
  fromStaleCache?: boolean
  onRetry?: () => void
  cityName: string
  checkin: string | null
  checkout: string | null
  adults: string
  /** Âges enfants en CSV (ex. "5,8"), tel quel depuis l'URL. */
  childrenAges: string | null
  /** Types de pension actuellement filtrés — pilote le Best Rate Engine. */
  activeBoardFilters?: string[]
  /** Requête actuelle complète (recherche + filtres + tri) — transmise à la
   * fiche hôtel pour que l'état survive l'aller-retour. */
  currentSearchQuery?: string
  onBookHotel?: (data: BookingData) => void
  /** Réinitialise les filtres actifs — affiché dans l'état vide "0 résultat
   * après filtrage" uniquement (pas de fausse action si la recherche myGo
   * elle-même n'a renvoyé aucun hôtel : voir `cardHotels.length === 0`). */
  onClearFilters?: () => void
}

export function HotelListings({
  offers,
  totalCount,
  currency = "TND",
  status,
  error,
  errorCode,
  degraded = false,
  fromStaleCache = false,
  onRetry,
  cityName,
  checkin,
  checkout,
  adults,
  childrenAges,
  activeBoardFilters = [],
  currentSearchQuery,
  onBookHotel,
  onClearFilters,
}: HotelListingsProps) {
  const router = useRouter()

  // Nombre de nuits partagé (récap header, prix/nuit sur chaque card, calcul
  // du draft de réservation) — un seul calcul, jamais trois divergents.
  const nightsCount = useMemo(() => {
    if (!checkin || !checkout) return undefined
    try {
      return Math.max(1, differenceInCalendarDays(parseISO(checkout), parseISO(checkin)))
    } catch {
      return undefined
    }
  }, [checkin, checkout])

  const handleBookHotel = (
    cardHotel: CardHotelShape,
    mealPlan: string,
    room?: RoomOption,
  ) => {
    if (
      !onBookHotel ||
      !room ||
      !checkin ||
      !checkout ||
      room.boardingId == null ||
      room.boardingCode == null
    ) {
      return
    }
    const nights = nightsCount ?? 1
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
      myGoToken: cardHotel.myGoToken,
      cityId: cardHotel.cityId,
      boardingId: room.boardingId,
      boardingCode: room.boardingCode,
      roomId: room.id,
    })
  }

  const handleViewDetails = (hotelId: number) => {
    // Transmet la recherche courante telle quelle (destination, dates,
    // occupation, filtres actifs, tri) — la fiche hôtel la retransmet à son
    // tour à "Voir les disponibilités" pour ne perdre aucun état.
    if (currentSearchQuery) {
      router.push(`/hotels/${hotelId}?${currentSearchQuery}`)
      return
    }
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

  const cardHotels = useMemo(
    () => offers.map((offer) => toCardShape(offer, activeBoardFilters, nightsCount)),
    [offers, activeBoardFilters, nightsCount],
  )

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
    // États d'erreur distincts (jamais un même texte générique pour tout) :
    // fournisseur indisponible / rate-limit / recherche incomplète / autre.
    const isUnavailable = errorCode === "service_unavailable"
    const isRateLimited = errorCode === "rate_limited"
    const isIncomplete = errorCode === "incomplete_query"
    const title = isUnavailable
      ? "Le service hôtelier est temporairement indisponible"
      : isRateLimited
        ? "Trop de recherches en peu de temps"
        : isIncomplete
          ? "Recherche incomplète"
          : "Erreur de recherche"
    return (
      <div className="border-destructive/40 bg-destructive/5 text-destructive rounded-lg border p-6 text-sm">
        <p className="font-semibold">{title}</p>
        <p className="mt-1">{error ?? "Erreur inconnue"}</p>
        {onRetry && !isIncomplete && (
          <button
            type="button"
            onClick={onRetry}
            className="border-destructive/40 hover:bg-destructive/10 mt-3 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
          >
            Réessayer
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {degraded && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          Résultats affichés depuis un cache récent — le fournisseur hôtelier
          est momentanément indisponible, les prix et disponibilités seront
          revérifiés avant toute réservation.
        </div>
      )}
      {!degraded && fromStaleCache && (
        <div className="text-muted-foreground text-xs">
          Résultats mis en cache — actualisation en cours.
        </div>
      )}
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
        {cardHotels.length === 0 &&
          (totalCount === 0 ? (
            // Zéro hôtel renvoyé par myGo lui-même (pas un effet des filtres
            // client) — proposer de changer la recherche, pas d'effacer des
            // filtres qui n'y sont pour rien.
            <div className="border-border text-muted-foreground rounded-lg border p-6 text-center text-sm">
              <p className="font-medium text-foreground">
                Aucun hôtel disponible pour cette recherche
              </p>
              <p className="mt-1">
                Essayez d&apos;autres dates ou une autre destination.
              </p>
              <Link
                href="/"
                className="text-primary mt-3 inline-block text-sm font-medium hover:underline"
              >
                Modifier la recherche
              </Link>
            </div>
          ) : (
            // Des hôtels existent (totalCount > 0) mais les filtres actifs
            // les excluent tous — l'action réelle est d'effacer les filtres,
            // pas de changer la recherche elle-même.
            <div className="border-border text-muted-foreground rounded-lg border p-6 text-center text-sm">
              <p className="font-medium text-foreground">
                Aucun hôtel ne correspond aux filtres sélectionnés
              </p>
              <p className="mt-1">
                {totalCount} hôtel{totalCount > 1 ? "s" : ""} trouvé
                {totalCount > 1 ? "s" : ""} pour cette recherche — essayez
                d&apos;élargir vos filtres.
              </p>
              {onClearFilters && (
                <button
                  type="button"
                  onClick={onClearFilters}
                  className="text-primary mt-3 text-sm font-medium hover:underline"
                >
                  Effacer tous les filtres
                </button>
              )}
            </div>
          ))}
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
