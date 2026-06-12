/**
 * Client GDS pour la recherche et réservation de vols
 *
 * Ce client gère les interactions avec les GDS (Global Distribution Systems)
 * comme Amadeus, Sabre, ou Travelport pour la recherche et réservation de vols.
 *
 * Mode actuel: MOCK/SANDBOX
 * En production, ce client sera connecté aux APIs réelles Amadeus/Sabre.
 *
 * Fonctionnalités:
 *  - Recherche de vols (aller simple, aller-retour)
 *  - Détails d'un vol spécifique
 *  - Génération de PNR (Passenger Name Record)
 *  - Support des vols nationaux et internationaux depuis la Tunisie
 */

import { z } from "zod"

/**
 * Erreur métier pour les opérations GDS
 */
export class FlightApiError extends Error {
  constructor(
    public kind: "network" | "auth" | "validation" | "not_found" | "unavailable",
    message: string,
  ) {
    super(message)
    this.name = "FlightApiError"
  }
}

/**
 * Schéma de validation pour la recherche de vols
 */
export const FlightSearchSchema = z.object({
  origin: z.string().length(3, "Code IATA de l'aéroport de départ (3 lettres)"),
  destination: z.string().length(3, "Code IATA de l'aéroport d'arrivée (3 lettres)"),
  departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format: YYYY-MM-DD"),
  returnDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format: YYYY-MM-DD")
    .optional(),
  adults: z.number().int().min(1).max(9).default(1),
  children: z.number().int().min(0).max(8).default(0),
  infants: z.number().int().min(0).max(8).default(0),
  cabinClass: z.enum(["economy", "premium_economy", "business", "first"]).default("economy"),
})

export type FlightSearchParams = z.infer<typeof FlightSearchSchema>

/**
 * Interface pour un segment de vol
 */
export interface FlightSegment {
  segmentId: string
  airline: string // Code IATA (ex: TU pour Tunisair)
  airlineName: string
  flightNumber: string
  origin: string // Code IATA aéroport
  originName: string
  destination: string // Code IATA aéroport
  destinationName: string
  departureTime: string // ISO 8601
  arrivalTime: string // ISO 8601
  duration: number // Minutes
  aircraft: string
  cabinClass: string
  bookingClass: string // Code de réservation (Y, C, etc.)
  availableSeats: number
}

/**
 * Interface pour un vol complet (peut avoir plusieurs segments)
 */
export interface Flight {
  flightId: string
  outbound: FlightSegment[]
  inbound?: FlightSegment[] // Pour les aller-retour
  totalDuration: number // Minutes
  stops: number
  price: {
    amount: number
    currency: string
    fareType: string // "published", "private", "negotiated"
    breakdown: {
      baseFare: number
      taxes: number
      fees: number
    }
  }
  availability: number // Nombre de sièges disponibles
  refundable: boolean
  changeable: boolean
  baggageAllowance: {
    checkedBags: number
    carryOn: number
    weightKg: number
  }
}

/**
 * Résultat de recherche de vols
 */
export interface FlightSearchResult {
  searchId: string
  origin: string
  destination: string
  departureDate: string
  returnDate?: string
  flights: Flight[]
  count: number
}

/**
 * Données mock pour les aéroports tunisiens
 */
const TUNISIAN_AIRPORTS = {
  TUN: "Tunis-Carthage",
  DJE: "Djerba-Zarzis",
  SFA: "Sfax-Thyna",
  MIR: "Monastir Habib Bourguiba",
  TOE: "Tozeur-Nefta",
}

/**
 * Données mock pour les destinations internationales
 */
const INTERNATIONAL_DESTINATIONS = {
  ORY: "Paris-Orly",
  CDG: "Paris-Charles de Gaulle",
  LYS: "Lyon-Saint Exupéry",
  MRS: "Marseille-Provence",
  NCE: "Nice-Côte d'Azur",
  FCO: "Rome-Fiumicino",
  IST: "Istanbul",
  DXB: "Dubai",
  CAI: "Le Caire",
  ALG: "Alger",
}

/**
 * Compagnies aériennes
 */
const AIRLINES = {
  TU: "Tunisair",
  AF: "Air France",
  TK: "Turkish Airlines",
  EK: "Emirates",
  MS: "EgyptAir",
  AH: "Air Algérie",
}

/**
 * Génère un PNR unique
 */
function generatePNR(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  let pnr = ""
  for (let i = 0; i < 6; i++) {
    pnr += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return pnr
}

/**
 * Génère des vols mock réalistes
 */
function generateMockFlights(params: FlightSearchParams): Flight[] {
  const flights: Flight[] = []
  const isRoundTrip = !!params.returnDate

  // Générer 5-10 vols fictifs
  const flightCount = Math.floor(Math.random() * 6) + 5

  for (let i = 0; i < flightCount; i++) {
    const airlineCode = Object.keys(AIRLINES)[Math.floor(Math.random() * Object.keys(AIRLINES).length)]
    const airline = AIRLINES[airlineCode as keyof typeof AIRLINES]
    
    // Vol aller
    const outboundSegment: FlightSegment = {
      segmentId: `${generatePNR()}-OUT`,
      airline: airlineCode,
      airlineName: airline,
      flightNumber: `${airlineCode}${Math.floor(Math.random() * 9000) + 1000}`,
      origin: params.origin,
      originName: TUNISIAN_AIRPORTS[params.origin as keyof typeof TUNISIAN_AIRPORTS] || 
                  INTERNATIONAL_DESTINATIONS[params.origin as keyof typeof INTERNATIONAL_DESTINATIONS] || 
                  params.origin,
      destination: params.destination,
      destinationName: TUNISIAN_AIRPORTS[params.destination as keyof typeof TUNISIAN_AIRPORTS] || 
                       INTERNATIONAL_DESTINATIONS[params.destination as keyof typeof INTERNATIONAL_DESTINATIONS] || 
                       params.destination,
      departureTime: `${params.departureDate}T${String(6 + i).padStart(2, "0")}:${String(Math.floor(Math.random() * 60)).padStart(2, "0")}:00Z`,
      arrivalTime: `${params.departureDate}T${String(8 + i).padStart(2, "0")}:${String(Math.floor(Math.random() * 60)).padStart(2, "0")}:00Z`,
      duration: 120 + Math.floor(Math.random() * 180), // 2-5 heures
      aircraft: ["A320", "B737", "A330", "B787"][Math.floor(Math.random() * 4)],
      cabinClass: params.cabinClass,
      bookingClass: params.cabinClass === "economy" ? "Y" : params.cabinClass === "business" ? "C" : "F",
      availableSeats: Math.floor(Math.random() * 50) + 10,
    }

    const baseFare = params.cabinClass === "economy" ? 
      150 + Math.random() * 300 : 
      params.cabinClass === "business" ? 
        500 + Math.random() * 800 : 
        1200 + Math.random() * 1500

    const flight: Flight = {
      flightId: generatePNR(),
      outbound: [outboundSegment],
      totalDuration: outboundSegment.duration,
      stops: 0,
      price: {
        amount: baseFare,
        currency: "EUR",
        fareType: "published",
        breakdown: {
          baseFare: baseFare * 0.75,
          taxes: baseFare * 0.20,
          fees: baseFare * 0.05,
        },
      },
      availability: outboundSegment.availableSeats,
      refundable: Math.random() > 0.5,
      changeable: Math.random() > 0.3,
      baggageAllowance: {
        checkedBags: params.cabinClass === "economy" ? 1 : 2,
        carryOn: 1,
        weightKg: params.cabinClass === "economy" ? 23 : 32,
      },
    }

    // Ajouter vol retour si aller-retour
    if (isRoundTrip && params.returnDate) {
      const inboundSegment: FlightSegment = {
        ...outboundSegment,
        segmentId: `${generatePNR()}-IN`,
        origin: params.destination,
        originName: outboundSegment.destinationName,
        destination: params.origin,
        destinationName: outboundSegment.originName,
        departureTime: `${params.returnDate}T${String(6 + i).padStart(2, "0")}:${String(Math.floor(Math.random() * 60)).padStart(2, "0")}:00Z`,
        arrivalTime: `${params.returnDate}T${String(8 + i).padStart(2, "0")}:${String(Math.floor(Math.random() * 60)).padStart(2, "0")}:00Z`,
      }
      flight.inbound = [inboundSegment]
      flight.totalDuration += inboundSegment.duration
      flight.price.amount *= 1.8 // Prix aller-retour
    }

    flights.push(flight)
  }

  // Trier par prix
  return flights.sort((a, b) => a.price.amount - b.price.amount)
}

/**
 * Client GDS principal
 */
export class GdsClient {
  private mode: "mock" | "production"

  constructor(mode: "mock" | "production" = "mock") {
    this.mode = mode
  }

  /**
   * Recherche de vols
   */
  async searchFlights(params: FlightSearchParams): Promise<FlightSearchResult> {
    // Validation des paramètres
    const validated = FlightSearchSchema.parse(params)

    // Mode Mock
    if (this.mode === "mock") {
      // Simuler une latence réseau
      await new Promise((resolve) => setTimeout(resolve, 500))

      const flights = generateMockFlights(validated)

      return {
        searchId: generatePNR(),
        origin: validated.origin,
        destination: validated.destination,
        departureDate: validated.departureDate,
        returnDate: validated.returnDate,
        flights,
        count: flights.length,
      }
    }

    // Mode Production (à implémenter)
    throw new FlightApiError(
      "unavailable",
      "Production GDS not yet configured. Please use mock mode.",
    )
  }

  /**
   * Récupère les détails d'un vol spécifique
   */
  async getFlightDetails(flightId: string): Promise<Flight | null> {
    if (this.mode === "mock") {
      // En mode mock, générer un vol fictif
      const mockFlight = generateMockFlights({
        origin: "TUN",
        destination: "ORY",
        departureDate: new Date().toISOString().split("T")[0],
        adults: 1,
        children: 0,
        infants: 0,
        cabinClass: "economy",
      })[0]

      return mockFlight ? { ...mockFlight, flightId } : null
    }

    throw new FlightApiError(
      "unavailable",
      "Production GDS not yet configured. Please use mock mode.",
    )
  }
}

/**
 * Instance singleton du client GDS
 */
let gdsClientInstance: GdsClient | null = null

export function getGdsClient(): GdsClient {
  if (!gdsClientInstance) {
    gdsClientInstance = new GdsClient("mock")
  }
  return gdsClientInstance
}
