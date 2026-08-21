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
 *     (codes IATA via `&lt;Select&gt;`, `cabin` en valeurs API).
 *
 * Ce module ne touche PAS au contrat de `app/api/vols/search/route.ts`
 * (son propre `SearchSchema` reste la source de vérité du moteur) — il se
 * contente de fabriquer, à partir de N'IMPORTE LEQUEL des deux formats
 * ci-dessus, un état canonique unique et les query params exacts que
 * l'API attend déjà.
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

export interface FlightSearchState {
  origin: string
  destination: string
  tripType: "oneway" | "roundtrip"
  departureDate: string
  returnDate?: string
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
  const tripTypeParam = searchParams.get("tripType")
  const tripType: "oneway" | "roundtrip" =
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

  const adultsRaw = searchParams.get("adults")
  const adults =
    adultsRaw && /^[1-9]$/.test(adultsRaw) ? Number(adultsRaw) : 1

  const childrenRaw = searchParams.get("children")
  const children =
    childrenRaw && /^[0-8]$/.test(childrenRaw) ? Number(childrenRaw) : 0

  const cabin = parseCabin(searchParams.get("cabin") ?? searchParams.get("class"))

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

/** Query params canoniques pour l'URL `/vols/search` elle-même (inclut tripType). */
export function flightStateToResultsParams(state: FlightSearchState): URLSearchParams {
  const params = flightStateToApiParams(state)
  params.set("tripType", state.tripType)
  return params
}
