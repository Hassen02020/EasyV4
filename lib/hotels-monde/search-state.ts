/**
 * World Hotel Search State — canonique, même rôle que lib/vols/search-state.ts
 * pour le module Vols : source de vérité unique pour la liste de
 * destinations et le parsing des query params `/hotels-monde/search`.
 *
 * `components/hotels-monde/world-hotel-search.tsx` (formulaire) importe
 * `POPULAR_DESTINATIONS` d'ici plutôt que de la dupliquer localement, pour
 * que le formulaire, l'API et les fixtures démo restent alignés sur la même
 * liste de destinations et le même mapping ville → pays.
 */

export interface WorldDestinationOption {
  value: string
  city: string
  country: string
  label: string
}

export const POPULAR_DESTINATIONS: WorldDestinationOption[] = [
  { value: "istanbul", city: "Istanbul", country: "Turquie", label: "Istanbul, Turquie" },
  { value: "dubai", city: "Dubaï", country: "Émirats Arabes Unis", label: "Dubaï, Émirats" },
  { value: "paris", city: "Paris", country: "France", label: "Paris, France" },
  { value: "rome", city: "Rome", country: "Italie", label: "Rome, Italie" },
  { value: "barcelona", city: "Barcelone", country: "Espagne", label: "Barcelone, Espagne" },
  { value: "london", city: "Londres", country: "Royaume-Uni", label: "Londres, Royaume-Uni" },
  { value: "cairo", city: "Le Caire", country: "Égypte", label: "Le Caire, Égypte" },
  { value: "marrakech", city: "Marrakech", country: "Maroc", label: "Marrakech, Maroc" },
  { value: "amsterdam", city: "Amsterdam", country: "Pays-Bas", label: "Amsterdam, Pays-Bas" },
  { value: "new_york", city: "New York", country: "États-Unis", label: "New York, États-Unis" },
]

export function destinationByValue(value: string): WorldDestinationOption | undefined {
  return POPULAR_DESTINATIONS.find((d) => d.value === value)
}

/**
 * Fait correspondre une saisie libre (venant du moteur de recherche rapide
 * de la page d'accueil, ex: "Paris") à une valeur connue de
 * POPULAR_DESTINATIONS — par égalité de value, puis par sous-chaîne du
 * label. Retourne "" (aucune présélection) plutôt qu'une valeur inventée
 * si rien ne correspond, pour ne jamais forcer un `Select` sur une option
 * qui n'existe pas dans sa liste.
 */
export function matchDestination(input: string | undefined): string {
  if (!input) return ""
  const needle = input.trim().toLowerCase()
  if (!needle) return ""
  const exact = POPULAR_DESTINATIONS.find((d) => d.value === needle)
  if (exact) return exact.value
  const byLabel = POPULAR_DESTINATIONS.find((d) =>
    d.label.toLowerCase().includes(needle),
  )
  return byLabel?.value ?? ""
}

export interface WorldHotelSearchState {
  destination: string
  city: string
  country: string
  checkIn: string
  checkOut: string
  nights: number
  adults: number
  rooms: number
  stars?: number
}

export type WorldHotelSearchParseResult =
  | { ok: true; state: WorldHotelSearchState }
  | { ok: false; error: string }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Parse tolérant des query params `/hotels-monde/search`. Fonction pure, testable sans DOM/réseau. */
export function parseWorldHotelSearchParams(
  searchParams: URLSearchParams,
): WorldHotelSearchParseResult {
  const destinationRaw = searchParams.get("destination") ?? ""
  const destination = destinationByValue(destinationRaw)
  if (!destination) {
    return { ok: false, error: "Destination manquante ou invalide." }
  }

  const checkIn = searchParams.get("checkIn")
  const checkOut = searchParams.get("checkOut")
  if (!checkIn || !DATE_RE.test(checkIn)) {
    return { ok: false, error: "Date d'arrivée manquante ou invalide." }
  }
  if (!checkOut || !DATE_RE.test(checkOut)) {
    return { ok: false, error: "Date de départ manquante ou invalide." }
  }
  if (checkOut <= checkIn) {
    return { ok: false, error: "La date de départ doit être après la date d'arrivée." }
  }

  const nights = Math.round(
    (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86_400_000,
  )

  const adultsRaw = searchParams.get("adults")
  const adults = adultsRaw && /^[1-9][0-9]?$/.test(adultsRaw) ? Number(adultsRaw) : 2

  const roomsRaw = searchParams.get("rooms")
  const rooms = roomsRaw && /^[1-5]$/.test(roomsRaw) ? Number(roomsRaw) : 1

  const starsRaw = searchParams.get("stars")
  const stars = starsRaw && /^[1-5]$/.test(starsRaw) ? Number(starsRaw) : undefined

  return {
    ok: true,
    state: {
      destination: destination.value,
      city: destination.city,
      country: destination.country,
      checkIn,
      checkOut,
      nights,
      adults,
      rooms,
      stars,
    },
  }
}

/** Query params canoniques attendus par `app/api/hotels-monde/search/route.ts`. */
export function worldHotelStateToApiParams(state: WorldHotelSearchState): URLSearchParams {
  const params = new URLSearchParams({
    destination: state.destination,
    checkIn: state.checkIn,
    checkOut: state.checkOut,
    adults: String(state.adults),
    rooms: String(state.rooms),
  })
  if (state.stars) params.set("stars", String(state.stars))
  return params
}
