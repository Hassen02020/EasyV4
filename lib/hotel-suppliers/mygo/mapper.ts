/**
 * Traduit les DTOs myGo déjà nettoyés (lib/mygo/mappers.ts — le parsing
 * XML/JSON brut vit là, inchangé, jamais dupliqué ici) vers le contrat
 * universel du Hub. C'est la SEULE couche qui connaît le nom "myGo" côté
 * normalisation.
 */
import type { HotelOfferDTO, HotelSummaryDTO, RoomOfferDTO } from "@/lib/mygo/types"
import type { NormalizedHotel, NormalizedRate, NormalizedCancellationPolicy, CancellationPolicyType } from "../core/types"

function toCancellationPolicyType(room: RoomOfferDTO): CancellationPolicyType {
  if (room.notRefundable) return "NON_REFUNDABLE"
  if (room.cancellationPolicies.length === 0) return "UNKNOWN"
  const hasFees = room.cancellationPolicies.some((p) => p.fees > 0)
  return hasFees ? "PARTIAL_PENALTY" : "FREE_CANCELLATION"
}

function toCancellationPolicy(room: RoomOfferDTO): NormalizedCancellationPolicy {
  const type = toCancellationPolicyType(room)
  const worst = room.cancellationPolicies.reduce<(typeof room.cancellationPolicies)[number] | null>(
    (acc, p) => (acc == null || p.fees > acc.fees ? p : acc),
    null,
  )
  return {
    type,
    deadline: worst?.fromDate,
    penaltyAmount: worst?.fees,
  }
}

export function mapMyGoHotelSummary(hotel: HotelSummaryDTO): NormalizedHotel {
  return {
    name: hotel.name,
    address: hotel.address,
    city: hotel.cityName,
    country: undefined,
    latitude: hotel.latitude != null ? Number(hotel.latitude) : undefined,
    longitude: hotel.longitude != null ? Number(hotel.longitude) : undefined,
    stars: hotel.stars,
    images: hotel.image ? [hotel.image] : [],
    facilities: hotel.facilities.map((f) => f.title),
    supplierMappings: [{ supplier: "mygo", supplierHotelCode: String(hotel.id) }],
  }
}

/** Encode l'identité multi-champs myGo (jamais interprétée hors de ce driver) dans un blob opaque. */
export function encodeMyGoSupplierToken(input: {
  cityId: number
  hotelId: number
  boardingId: number
  roomId: number
  searchToken: string
}): string {
  return JSON.stringify(input)
}

export function decodeMyGoSupplierToken(token: string): {
  cityId: number
  hotelId: number
  boardingId: number
  roomId: number
  searchToken: string
} {
  return JSON.parse(token)
}

export function mapMyGoOfferToRates(
  offer: HotelOfferDTO,
  cityId: number,
  occupancy: { adults: number; childAges?: number[] },
): NormalizedRate[] {
  const rates: NormalizedRate[] = []
  for (const boarding of offer.boardings) {
    for (const pax of boarding.pax) {
      for (const room of pax.rooms) {
        rates.push({
          hotelId: String(offer.hotel.id),
          supplier: "mygo",
          supplierHotelCode: String(offer.hotel.id),
          supplierRateCode: `${boarding.id}:${room.id}`,
          roomId: String(room.id),
          roomName: room.name,
          board: boarding.name,
          occupancy,
          currency: offer.currency,
          netPrice: room.basePrice ?? room.price,
          sellingPrice: room.price,
          cancellationPolicy: toCancellationPolicy(room),
          refundable: !room.notRefundable,
          availability: room.stopReservation ? "ON_REQUEST" : "AVAILABLE",
          supplierToken: encodeMyGoSupplierToken({
            cityId,
            hotelId: offer.hotel.id,
            boardingId: boarding.id,
            roomId: room.id,
            searchToken: offer.token,
          }),
        })
      }
    }
  }
  return rates
}
