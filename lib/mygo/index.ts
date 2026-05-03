/**
 * Barrel export du client myGo.
 */
export { getMyGoClient, MyGoClient, type HotelSearchInput } from "./client"
export {
  mapCity,
  mapBoarding,
  mapCurrency,
  mapTag,
  mapHotelSummary,
  mapHotelDetails,
  mapHotelOffer,
  isRealHotelOffer,
  lowestPrice,
  dedupeOffersByHotelId,
} from "./mappers"
export { sanitizeHtmlToText } from "./sanitize-html"
export type {
  CityDTO,
  BoardingDTO,
  CurrencyDTO,
  TagDTO,
  HotelSummaryDTO,
  HotelDetailsDTO,
  HotelOfferDTO,
  BoardingOfferDTO,
  RoomOfferDTO,
  CancellationPolicyDTO,
} from "./types"
export {
  MyGoError,
  MyGoApiError,
  MyGoAuthError,
  MyGoNetworkError,
  MyGoTimeoutError,
  MyGoSchemaError,
  MyGoCircuitOpenError,
} from "./errors"
