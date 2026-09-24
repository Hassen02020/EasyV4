/**
 * Flight Search State — canonique, réconcilie les deux formats d'entrée
 * existants pour la recherche de vols :
 *
 *  1. Le widget rapide de la homepage (`components/booking-engine.tsx`,
 *     `VolsForm`) envoie vers `/vols` des champs "libres" : origin/
 *     destination en texte libre style "Tunis (TUN)", `class` en valeurs
 *     françaises (economique/premium/business), `babies`/`flexible` non
 *     supportés par le moteur.
 *  2. Le formulaire de la page `/vols` (`components/vols/flight-search.tsx`,
 *     `FlightSearch`) envoie vers `/vols/search` des champs déjà propres
 *     (codes IATA via `<Select>`, `cabin` en valeurs API).
 *
 * Trois types de voyages :
 *  - `oneway`    : TUN → DXB, un seul segment
 *  - `roundtrip` : TUN ⇄ DXB, segment aller + `returnDate`
 *  - `multicity` : N segments indépendants encodés dans `legs`
 *
 * Encoding multicity : `legs=TUN:DXB:2026-12-01,DXB:BKK:2026-12-05,...`
 * (virgule entre les tronçons, deux-points entre origin/destination/date)
 *
 * `babies`/`infants` et `flexible` (dates flexibles) ne sont pas modélisés
 * ici : ni `SearchSchema` (route API) ni `FlightOfferSchema`
 * (lib/vols/client.ts) n'ont de notion de passager infant ou de tarif
 * flexible — les inventer côté Search State sans support moteur réel
 * aurait été un mensonge d'UI. Documenté comme limitation connue plutôt
 * que simulé.
 */

export interface AirportOption {
  code: string
  label: string
}

export const AIRPORTS: AirportOption[] = [
  { code: "TUN", label: "Tunis–Carthage (TUN)" },
  { code: "SFA", label: "Sfax–Thyna (SFA)" },
  { code: "TOE", label: "Tozeur–Nefta (TOE)" },
  { code: "MIR", label: "Monastir Habib Bourguiba (MIR)" },
  { code: "DJE", label: "Djerba–Zarzis (DJE)" },
  { code: "CDG", label: "Paris Charles de Gaulle (CDG)" },
  { code: "ORY", label: "Paris Orly (ORY)" },
  { code: "LYS", label: "Lyon Saint-Exupéry (LYS)" },
  { code: "FCO", label: "Rome Fiumicino (FCO)" },
  { code: "IST", label: "Istanbul (IST)" },
  { code: "DXB", label: "Dubaï (DXB)" },
]

export type CabinClass = "ECONOMY" | "PREMIUM_ECONOMY" | "BUSINESS" | "FIRST"
export type TripType = "oneway" | "roundtrip" | "multicity"

const VALID_CABINS = new Set<CabinClass>([
  "ECONOMY",
  "PREMIUM_ECONOMY",
  "BUSINESS",
  "FIRST",
])

/** Valeurs françaises envoyées par le widget rapide de la homepage. */
const CABIN_FROM_HOME: Record<string, CabinClass> = {
  economique: "ECONOMY",
  premium: "PREMIUM_ECONOMY",
  business: "BUSINESS",
}

export function airportLabel(code: string): string {
  return AIRPORTS.find((a) => a.code === code)?.label ?? code
}

/**
 * Accepte soit un code IATA nu ("TUN"), soit le format "Ville (CODE)"
 * envoyé par le widget homepage ("Tunis (TUN)") — extrait et valide le
 * code dans les deux cas. Ne restreint PAS à la liste `AIRPORTS` (qui
 * n'est qu'une liste de suggestions pour les menus déroulants) : tout
 * code à 3 lettres bien formé est accepté, cohérent avec la validation
 * `SearchSchema` de la route API elle-même.
 */
export function parseAirportInput(input: string | null | undefined): string | null {
  if (!input) return null
  const fromParens = input.match(/\(([A-Za-z]{3})\)\s*$/)
  const candidate = (fromParens?.[1] ?? input).trim().toUpperCase()
  return /^[A-Z]{3}$/.test(candidate) ? candidate : null
}

export function parseCabin(cabinOrClass: string | null | undefined): CabinClass {
  if (!cabinOrClass) return "ECONOMY"
  const upper = cabinOrClass.toUpperCase()
  if (VALID_CABINS.has(upper as CabinClass)) return upper as CabinClass
  return CABIN_FROM_HOME[cabinOrClass.toLowerCase()] ?? "ECONOMY"
}

// ---------------------------------------------------------------------------
// Multi-city legs
// ---------------------------------------------------------------------------

export interface MultiCityLeg {
  origin: string
  destination: string
  departureDate: string
}

/** Encode N legs as a single URL parameter value. */
export function encodeMultiCityLegs(legs: MultiCityLeg[]): string {
  return legs.map((l) => `${l.origin}:${l.destination}:${l.departureDate}`).join(",")
}

/** Decode legs from URL. Returns null if any leg is malformed. */
export function parseMultiCityLegs(raw: string | null | undefined): MultiCityLeg[] | null {
  if (!raw) return null
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean)
  if (parts.length < 2 || parts.length > 5) return null
  const legs: MultiCityLeg[] = []
  for (const part of parts) {
    const [rawOrigin, rawDest, date] = part.split(":")
    const origin = parseAirportInput(rawOrigin)
    const destination = parseAirportInput(rawDest)
    if (!origin || !destination || !date || !DATE_RE.test(date)) return null
    legs.push({ origin, destination, departureDate: date })
  }
  return legs
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface FlightSearchState {
  origin: string
  destination: string
  tripType: TripType
  departureDate: string
  returnDate?: string
  legs?: MultiCityLeg[]
  cabin: CabinClass
  adults: number
  children: number
}

export type FlightSearchParseResult =
  | { ok: true; state: FlightSearchState }
  | { ok: false; error: string }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Parse tolérant — accepte indifféremment les params bruts de `/vols`
 * (homepage) ou de `/vols/search` (formulaire interne). Fonction pure,
 * testable sans DOM/réseau.
 */
export function parseFlightSearchParams(
  searchParams: URLSearchParams,
): FlightSearchParseResult {
  const adultsRaw = searchParams.get("adults")
  const adults =
    adultsRaw && /^[1-9]$/.test(adultsRaw) ? Number(adultsRaw) : 1

  const childrenRaw = searchParams.get("children")
  const children =
    childrenRaw && /^[0-8]$/.test(childrenRaw) ? Number(childrenRaw) : 0

  const cabin = parseCabin(searchParams.get("cabin") ?? searchParams.get("class"))

  const tripTypeParam = searchParams.get("tripType")

  // ── Multi-city ──────────────────────────────────────────────────────────
  if (tripTypeParam === "multicity") {
    const legs = parseMultiCityLegs(searchParams.get("legs"))
    if (!legs || legs.length < 2) {
      return {
        ok: false,
        error: "Multi-destinations : au moins 2 trajets valides requis.",
      }
    }
    return {
      ok: true,
      state: {
        origin: legs[0].origin,
        destination: legs[legs.length - 1].destination,
        tripType: "multicity",
        departureDate: legs[0].departureDate,
        legs,
        cabin,
        adults,
        children,
      },
    }
  }

  // ── One-way / Round-trip ─────────────────────────────────────────────────
  const origin = parseAirportInput(searchParams.get("origin"))
  const destination = parseAirportInput(searchParams.get("destination"))

  if (!origin || !destination) {
    return {
      ok: false,
      error: "Aéroport de départ et/ou de destination manquant ou invalide.",
    }
  }
  if (origin === destination) {
    return {
      ok: false,
      error: "L'aéroport de départ et d'arrivée doivent être différents.",
    }
  }

  const departureDate = searchParams.get("departureDate")
  if (!departureDate || !DATE_RE.test(departureDate)) {
    return { ok: false, error: "Date de départ manquante ou invalide." }
  }

  const returnDateRaw = searchParams.get("returnDate")
  const tripType: TripType =
    tripTypeParam === "roundtrip" || (!tripTypeParam && !!returnDateRaw)
      ? "roundtrip"
      : "oneway"

  let returnDate: string | undefined
  if (tripType === "roundtrip") {
    if (!returnDateRaw || !DATE_RE.test(returnDateRaw)) {
      return {
        ok: false,
        error: "Date de retour manquante ou invalide pour un aller-retour.",
      }
    }
    if (returnDateRaw < departureDate) {
      return {
        ok: false,
        error: "La date de retour doit être après la date de départ.",
      }
    }
    returnDate = returnDateRaw
  }

  return {
    ok: true,
    state: { origin, destination, tripType, departureDate, returnDate, cabin, adults, children },
  }
}

/** Query params canoniques attendus par `app/api/vols/search/route.ts`. */
export function flightStateToApiParams(state: FlightSearchState): URLSearchParams {
  const params = new URLSearchParams({
    origin: state.origin,
    destination: state.destination,
    departureDate: state.departureDate,
    adults: String(state.adults),
    cabin: state.cabin,
  })
  if (state.children > 0) params.set("children", String(state.children))
  if (state.returnDate) params.set("returnDate", state.returnDate)
  return params
}

/** Query params canoniques pour l'URL `/vols/search` elle-même. */
export function flightStateToResultsParams(state: FlightSearchState): URLSearchParams {
  if (state.tripType === "multicity" && state.legs) {
    const params = new URLSearchParams({
      tripType: "multicity",
      legs: encodeMultiCityLegs(state.legs),
      adults: String(state.adults),
      children: state.children > 0 ? String(state.children) : "0",
      cabin: state.cabin,
      // origin/destination/departureDate from first leg (for breadcrumb compat)
      origin: state.legs[0].origin,
      destination: state.legs[state.legs.length - 1].destination,
      departureDate: state.legs[0].departureDate,
    })
    return params
  }
  const params = flightStateToApiParams(state)
  params.set("tripType", state.tripType)
  return params
}
