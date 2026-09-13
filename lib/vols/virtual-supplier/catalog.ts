/**
 * Génération déterministe d'offres de vols pour le Virtual Flight
 * Supplier — même philosophie que le catalogue myGo : pour une route/date
 * donnée, TOUJOURS les mêmes offres de base (carriers/horaires/prix), afin
 * qu'un test répété reste reproductible ; seule la disponibilité réelle
 * (lib/vols/virtual-supplier/inventory-store.ts) bouge avec les
 * réservations/annulations effectuées pendant le run.
 */

import { hashSeed, mulberry32Like } from "./rng"

export type Cabin = "ECONOMY" | "PREMIUM_ECONOMY" | "BUSINESS" | "FIRST"

export interface VirtualFlightSegment {
  origin: string
  destination: string
  departureAt: string
  arrivalAt: string
  carrier: string
  flightNumber: string
  durationMinutes: number
  cabin: Cabin
}

export interface VirtualFlightOffer {
  offerId: string
  segments: VirtualFlightSegment[]
  stops: number
  totalDurationMinutes: number
  unitPriceTnd: number
  refundable: boolean
  baggageKg: number
}

const CARRIERS = [
  { code: "TU", name: "Tunisair" },
  { code: "BJ", name: "Nouvelair" },
  { code: "AF", name: "Air France" },
  { code: "TK", name: "Turkish Airlines" },
]

const HUBS: Record<string, string> = {
  TUN: "TUN",
  NBE: "NBE",
  DJE: "DJE",
  CDG: "CDG",
  ORY: "ORY",
  IST: "IST",
  FCO: "FCO",
  FRA: "FRA",
}

function minutesToIso(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `PT${h}H${m > 0 ? `${m}M` : ""}`
}

function addMinutes(dateIso: string, timeMinutesFromMidnight: number, plusDuration: number): string {
  const base = new Date(`${dateIso}T00:00:00Z`)
  base.setUTCMinutes(base.getUTCMinutes() + timeMinutesFromMidnight + plusDuration)
  return base.toISOString().slice(0, 16)
}

function baseDepartureTime(dateIso: string, offerIndex: number): string {
  const base = new Date(`${dateIso}T00:00:00Z`)
  base.setUTCMinutes(base.getUTCMinutes() + timeMinutesFromMidnight(offerIndex))
  return base.toISOString().slice(0, 16)
}

function timeMinutesFromMidnight(offerIndex: number): number {
  // 3 créneaux réalistes : matin/après-midi/soir.
  return [6 * 60 + 30, 13 * 60 + 45, 19 * 60 + 20][offerIndex % 3]!
}

/** Génère 3 à 5 offres déterministes pour cette route/date/cabine/pax. */
export function generateOffers(input: {
  origin: string
  destination: string
  departureDate: string
  cabin: Cabin
  adults: number
  children: number
}): VirtualFlightOffer[] {
  const seed = hashSeed(`${input.origin}:${input.destination}:${input.departureDate}:${input.cabin}`)
  const rng = mulberry32Like(seed)
  const offerCount = 3 + Math.floor(rng() * 3) // 3..5
  const basePriceTnd = 250 + Math.floor(rng() * 400) // 250..650 (avant cabine/route)
  const cabinMultiplier = { ECONOMY: 1, PREMIUM_ECONOMY: 1.5, BUSINESS: 2.8, FIRST: 4.2 }[input.cabin]

  const offers: VirtualFlightOffer[] = []
  for (let i = 0; i < offerCount; i++) {
    const carrier = CARRIERS[Math.floor(rng() * CARRIERS.length)]!
    const stops = rng() < 0.65 ? 0 : 1
    const legDurationMin = 90 + Math.floor(rng() * 240) // 1h30 à 5h30 par segment
    const flightNumber = `${carrier.code}${100 + Math.floor(rng() * 800)}`
    const departTime = timeMinutesFromMidnight(i)
    const departureAt = baseDepartureTime(input.departureDate, i)

    const segments: VirtualFlightSegment[] = []
    if (stops === 0) {
      segments.push({
        origin: input.origin,
        destination: input.destination,
        departureAt,
        arrivalAt: addMinutes(input.departureDate, departTime, legDurationMin),
        carrier: carrier.code,
        flightNumber,
        durationMinutes: legDurationMin,
        cabin: input.cabin,
      })
    } else {
      const hubCodes = Object.keys(HUBS).filter((h) => h !== input.origin && h !== input.destination)
      const hub = hubCodes[Math.floor(rng() * hubCodes.length)] ?? "IST"
      const leg1 = Math.floor(legDurationMin * 0.55)
      const layover = 60 + Math.floor(rng() * 90)
      const leg2 = legDurationMin - leg1
      segments.push(
        {
          origin: input.origin,
          destination: hub,
          departureAt,
          arrivalAt: addMinutes(input.departureDate, departTime, leg1),
          carrier: carrier.code,
          flightNumber,
          durationMinutes: leg1,
          cabin: input.cabin,
        },
        {
          origin: hub,
          destination: input.destination,
          departureAt: addMinutes(input.departureDate, departTime, leg1 + layover),
          arrivalAt: addMinutes(input.departureDate, departTime, leg1 + layover + leg2),
          carrier: carrier.code,
          flightNumber: `${carrier.code}${100 + Math.floor(rng() * 800)}`,
          durationMinutes: leg2,
          cabin: input.cabin,
        },
      )
    }

    const totalDurationMinutes = segments.reduce((s, seg) => s + seg.durationMinutes, 0)
    const stopsPenalty = stops === 0 ? 1 : 0.82 // vol direct plus cher
    const unitPriceTnd = Math.round(basePriceTnd * cabinMultiplier * stopsPenalty * (0.9 + rng() * 0.25))

    offers.push({
      offerId: `${input.origin}-${input.destination}-${input.departureDate}-${carrier.code}-${flightNumber}-${input.cabin}`,
      segments,
      stops,
      totalDurationMinutes,
      unitPriceTnd,
      refundable: rng() < 0.35,
      baggageKg: input.cabin === "ECONOMY" ? (rng() < 0.5 ? 20 : 23) : 32,
    })
  }
  return offers
}

export { minutesToIso }
