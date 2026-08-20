/**
 * Barrel export du client myGo.
 */
export {
  getMyGoClient,
  MyGoClient,
  HOTEL_SETTLEMENT_CURRENCY,
  type HotelSearchInput,
  type CreateBookingInput,
  type CreateBookingRoomInput,
  type CancelBookingInput,
  type ListBookingsFilters,
} from "./client"
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
  mapBookingConfirmation,
  mapBookingCancellation,
  mapBookingListItemToConfirmation,
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
  BookingConfirmationDTO,
  BookingCancellationDTO,
  BookingRoomDTO,
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
