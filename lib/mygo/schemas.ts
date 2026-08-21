/**
 * Schémas Zod pour valider les réponses brutes de l'API myGo.
 *
 * Note importante: les schémas sont *permissifs* (passthrough sur les objets, transforme les
 * strings numériques en number) parce que la doc PDF myGo et la réponse réelle divergent
 * fréquemment (ex: `Checkout` vs `CheckOut`, `Available` absent, prix en string `"651.000"`,
 * etc.). On préfère valider les champs CRITIQUES seulement et laisser passer les extras.
 */

import { z } from "zod"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convertit "651.000" → 651 (number). Tolère number ou string. */
const NumericString = z
  .union([z.string(), z.number()])
  .transform((v) => {
    if (typeof v === "number") return v
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  })

/** Tolère soit un nombre, soit une string castable en nombre. Garde number. */
const FlexibleInt = z
  .union([z.string(), z.number()])
  .transform((v) => {
    if (typeof v === "number") return v
    const n = parseInt(v, 10)
    return Number.isFinite(n) ? n : 0
  })

/** Tolère array vide [] OU objet OU null pour les champs ErrorMessage de myGo. */
const ErrorMessage = z
  .union([
    z.array(z.unknown()).length(0),
    z.null(),
    z.object({
      Code: z.number().optional(),
      Description: z.string().optional(),
    }),
  ])
  .nullable()
  .optional()

const Country = z
  .object({
    Id: FlexibleInt.optional(),
    Name: z.string().optional(),
  })
  .or(z.string()) // HotelDetail renvoie parfois City.Country en string
  .optional()

const Localization = z
  .object({
    Longitude: z.string().optional(),
    Latitude: z.string().optional(),
  })
  .optional()

const City = z.object({
  Id: FlexibleInt.optional(),
  Name: z.string().optional(),
  Region: z.string().optional(),
  Country: Country,
  ShortDescription: z.string().nullish(),
  Adress: z.string().nullish(),
  Localization: Localization,
})

const Category = z
  .object({
    Id: FlexibleInt.optional(),
    Title: z.string().optional(),
    Star: z.union([z.number(), z.string()]).nullish(),
  })
  .partial()

// ---------------------------------------------------------------------------
// Static data responses
// ---------------------------------------------------------------------------

export const ListCityItem = z.object({
  Id: FlexibleInt,
  Name: z.string(),
  Region: z.string().nullish(),
  Country: Country,
})

export const ListCityResponse = z.object({
  ListCity: z.array(ListCityItem).nullable().optional(),
  CountResults: z.number().optional(),
  ErrorMessage,
})

export const ListBoardingItem = z.object({
  Id: FlexibleInt,
  Code: z.string(),
  Name: z.string(),
  Description: z.string().nullish(),
})

export const ListBoardingResponse = z.object({
  ListBoarding: z.array(ListBoardingItem).nullable().optional(),
  CountResults: z.number().optional(),
  ErrorMessage,
})

export const ListCurrencyItem = z.object({
  Code: z.string(),
  Symbol: z.string(),
})

export const ListCurrencyResponse = z.object({
  ListCurrency: z.array(ListCurrencyItem).nullable().optional(),
  CountResults: z.number().optional(),
  ErrorMessage,
})

export const ListTagItem = z.object({
  Id: FlexibleInt,
  Title: z.string(),
})

export const ListTagResponse = z.object({
  ListTag: z.array(ListTagItem).nullable().optional(),
  CountResults: z.number().optional(),
  ErrorMessage,
})

// ---------------------------------------------------------------------------
// ListHotel response
// ---------------------------------------------------------------------------

export const Facility = z
  .object({
    Title: z.string().nullish(),
    Category: z.string().nullish(),
  })
  .partial()

export const ListHotelItem = z
  .object({
    Id: FlexibleInt,
    Name: z.string(),
    Category: Category.optional(),
    City: City.optional(),
    Adress: z.string().nullish(),
    Image: z.string().nullish(),
    Localization: Localization,
    Facilities: z.array(Facility).nullish(),
    Theme: z.array(z.string()).nullish(),
    Note: z.string().nullish(),
  })
  .passthrough()

export const ListHotelResponse = z.object({
  ListHotel: z.array(ListHotelItem).nullable().optional(),
  CountResults: z.number().optional(),
  ErrorMessage,
})

// ---------------------------------------------------------------------------
// HotelDetail response
// ---------------------------------------------------------------------------

export const AlbumItem = z.object({
  Url: z.string(),
  Description: z.string().nullish(),
  Alt: z.string().nullish(),
})

export const HotelOption = z.object({
  Id: FlexibleInt,
  Title: z.string(),
})

export const HotelDetailItem = z
  .object({
    Id: FlexibleInt,
    Name: z.string(),
    Category: Category.optional(),
    City: City.optional(),
    Email: z.string().nullish(),
    Phone: z.string().nullish(),
    ShortDescription: z.string().nullish(),
    LongDescription: z.string().nullish(),
    Adress: z.string().nullish(),
    Localization: Localization,
    CheckIn: z.string().nullish(),
    CheckOut: z.string().nullish(),
    Type: z.string().nullish(),
    Image: z.string().nullish(),
    Album: z.array(AlbumItem).nullish(),
    Facilities: z.array(Facility).nullish(),
    Option: z.array(HotelOption).nullish(),
    Theme: z.array(z.string()).nullish(),
    Note: z.string().nullish(),
  })
  .passthrough()

export const HotelDetailResponse = z.object({
  HotelDetail: HotelDetailItem.nullable().optional(),
  ErrorMessage,
})

// ---------------------------------------------------------------------------
// HotelSearch response
// ---------------------------------------------------------------------------

export const CancellationPolicy = z
  .object({
    Fees: NumericString,
    Type: z.enum(["PRICE", "PERCENT", "NIGHT"]).or(z.string()),
    Nature: z.enum(["NO_SHOW", "PREMATURE_DEPARTURE", "BEFORE_ARRIVAL"]).or(z.string()),
    FromDate: z.string().nullish(),
    MinStay: FlexibleInt.nullish(),
    MaxStay: FlexibleInt.nullish(),
  })
  .partial()

export const RoomOffer = z
  .object({
    Id: FlexibleInt,
    Name: z.string(),
    Photo: z.string().nullish(),
    Description: z.string().nullish(),
    Icones: z.array(z.unknown()).nullish(),
    Quantity: FlexibleInt.nullish(),
    Price: NumericString,
    BasePrice: NumericString.nullish(),
    PriceWithAffiliateMarkup: NumericString.nullish(),
    StopReservation: z.boolean().nullish(),
    OnRequest: z.boolean().nullish(),
    NotRefundable: z.boolean().nullish(),
    CancellationPolicy: z.array(CancellationPolicy).nullish(),
    CancellationDeadline: z.string().nullish(),
  })
  .passthrough()

export const PaxOffer = z
  .object({
    Adult: FlexibleInt,
    Child: z.array(FlexibleInt).nullish(),
    Rooms: z.array(RoomOffer),
  })
  .passthrough()

export const BoardingOffer = z
  .object({
    Id: FlexibleInt,
    Code: z.string().optional(),
    Name: z.string(),
    Description: z.string().nullish(),
    Pax: z.array(PaxOffer),
  })
  .passthrough()

export const PriceBlock = z
  .object({
    Boarding: z.array(BoardingOffer),
    BasePrice: NumericString.nullish(),
    Currency: z.string().nullish(),
  })
  .passthrough()

export const HotelSearchResultItem = z
  .object({
    Hotel: ListHotelItem,
    Token: z.string(),
    Price: PriceBlock,
    Source: z.union([z.number(), z.string()]).nullish(),
    Currency: z.string().nullish(),
    Recommended: z.union([z.number(), z.boolean(), z.string()]).nullish(),
  })
  .passthrough()

export const HotelSearchResponse = z.object({
  HotelSearch: z.array(HotelSearchResultItem).nullable().optional(),
  CountResults: z.number().optional(),
  SearchId: z.string().nullish(),
  ErrorMessage,
})

// ---------------------------------------------------------------------------
// Booking responses (Iteration 4 — schemas in place but not yet wired)
// ---------------------------------------------------------------------------

export const BookingState = z.enum(["OnRequest", "Validated", "Cancelled"])

export const BookingPaxAdult = z.object({
  Civility: z.string(),
  Name: z.string(),
  Surname: z.string(),
  Holder: z.boolean(),
})

export const BookingPaxChild = z.object({
  Name: z.string(),
  Surname: z.string(),
  Age: FlexibleInt,
})

export const BookingCreationResponse = z
  .object({
    Id: FlexibleInt.optional(),
    Hotel: ListHotelItem.optional(),
    CheckIn: z.string().optional(),
    CheckOut: z.string().optional(),
    AtHotel: NumericString.nullish(),
    State: BookingState.optional(),
    TotalPrice: NumericString.optional(),
    Currency: z.string().optional(),
    Source: FlexibleInt.nullish(),
    ErrorMessage,
  })
  .passthrough()

export const BookingCancellationResponse = z
  .object({
    Booking: FlexibleInt.optional(),
    Fee: NumericString.nullish(),
    Currency: z.string().nullish(),
    PreCancelled: z.boolean().nullish(),
    Nature: z.string().nullish(),
    Cancelled: z.string().nullish(),
    ErrorMessage,
  })
  .passthrough()

// ---------------------------------------------------------------------------
// Type exports
// ---------------------------------------------------------------------------

export type ListCityItemT = z.infer<typeof ListCityItem>
export type ListBoardingItemT = z.infer<typeof ListBoardingItem>
export type ListCurrencyItemT = z.infer<typeof ListCurrencyItem>
export type ListTagItemT = z.infer<typeof ListTagItem>
export type ListHotelItemT = z.infer<typeof ListHotelItem>
export type HotelDetailItemT = z.infer<typeof HotelDetailItem>
export type HotelSearchResultItemT = z.infer<typeof HotelSearchResultItem>
export type RoomOfferT = z.infer<typeof RoomOffer>
export type BoardingOfferT = z.infer<typeof BoardingOffer>
export type CancellationPolicyT = z.infer<typeof CancellationPolicy>
