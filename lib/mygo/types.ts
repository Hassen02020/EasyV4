/**
 * Types DTO « propres » exposés au reste de l'application (UI, route handlers).
 *
 * Ces types sont produits par les mappers à partir des réponses brutes myGo (z-schemas).
 * On nettoie ici : numbers cohérents, dates ISO, structure imbriquée allégée.
 */

export interface CityDTO {
  id: number
  name: string
  region?: string
  countryId?: number
  countryName?: string
}

export interface BoardingDTO {
  id: number
  code: string
  name: string
  description?: string
}

export interface CurrencyDTO {
  code: string
  symbol: string
}

export interface TagDTO {
  id: number
  title: string
}

export interface FacilityDTO {
  title: string
  category?: string
}

export interface HotelSummaryDTO {
  id: number
  name: string
  stars?: number
  categoryTitle?: string
  cityId?: number
  cityName?: string
  region?: string
  address?: string
  image?: string
  longitude?: string
  latitude?: string
  facilities: FacilityDTO[]
  themes: string[]
  note?: string
}

export interface HotelDetailsDTO extends HotelSummaryDTO {
  email?: string
  phone?: string
  shortDescription?: string
  longDescription?: string
  checkInTime?: string
  checkOutTime?: string
  type?: string
  album: { url: string; alt?: string }[]
  options: { id: number; title: string }[]
}

export type CancellationType = "PRICE" | "PERCENT" | "NIGHT" | string
export type CancellationNature =
  | "NO_SHOW"
  | "PREMATURE_DEPARTURE"
  | "BEFORE_ARRIVAL"
  | string

export interface CancellationPolicyDTO {
  fees: number
  type: CancellationType
  nature: CancellationNature
  fromDate?: string
  minStay?: number
  maxStay?: number
}

export interface RoomOfferDTO {
  id: number
  name: string
  photo?: string
  description?: string
  quantity?: number
  price: number
  basePrice?: number
  stopReservation: boolean
  notRefundable: boolean
  cancellationPolicies: CancellationPolicyDTO[]
}

export interface BoardingOfferDTO {
  id: number
  code: string
  name: string
  description?: string
  /** Le board peut avoir plusieurs combinaisons pax (en pratique 1 par recherche). */
  pax: { adult: number; child: number[]; rooms: RoomOfferDTO[] }[]
}

export interface HotelOfferDTO {
  hotel: HotelSummaryDTO
  /** À renvoyer dans BookingCreation. Expire — ne pas stocker en DB longtemps. */
  token: string
  currency: string
  /** Plus bas prix toutes chambres/boards confondus (en `currency`). */
  fromPrice: number
  recommended: boolean
  boardings: BoardingOfferDTO[]
}

export interface HotelSearchResultDTO {
  searchId?: string
  count: number
  /** Hôtels "vrais" filtrés (les attractions/parcs sont écartés). */
  offers: HotelOfferDTO[]
}
