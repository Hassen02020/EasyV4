/**
 * Cœur du Virtual MyGo Supplier — implémente chaque méthode du contrat
 * (ListCity, ListBoarding, ListCurrency, ListTag, ListHotel, HotelDetail,
 * HotelSearch, BookingCreation, BookingCancellation, BookingList) en
 * renvoyant des objets au format EXACT attendu par les schémas Zod réels de
 * lib/mygo/schemas.ts — aucune adaptation côté client n'est nécessaire :
 * c'est le même parseur qui valide une réponse virtuelle ou réelle.
 */

import {
  VIRTUAL_CITIES,
  VIRTUAL_BOARDINGS,
  VIRTUAL_CURRENCIES,
  VIRTUAL_TAGS,
  getCatalog,
  findHotel,
  findRoom,
  findBoarding,
  type VirtualHotel,
  type VirtualRoomType,
} from "./catalog"
import {
  currentAvailability,
  availabilityLevel,
  nightsBetween,
  reserve,
  release,
} from "./inventory-store"
import { issueToken, newSearchId, validateToken, matchesBookingContext } from "./tokens"
import { getScenario, SIMULATED_TIMEOUT_DELAY_MS } from "./scenarios"
import {
  createBookingRecord,
  cancelBookingRecord,
  findBookingById,
  listBookingRecords,
  injectBookingRecord,
  type StoredBooking,
} from "./booking-ledger"

// ---------------------------------------------------------------------------
// Pricing (item 13) — jamais un prix final codé en dur
// ---------------------------------------------------------------------------

const BOARDING_MULTIPLIER: Record<string, number> = {
  LS: 1.0,
  LPD: 1.15,
  DP: 1.35,
  PC: 1.55,
  ALL: 1.9,
}

function nightlyPrice(room: VirtualRoomType, boardingCode: string, adults: number, children: number): number {
  const multiplier = BOARDING_MULTIPLIER[boardingCode] ?? 1.2
  const base = room.basePrice * multiplier
  const extraAdults = Math.max(0, adults - 2) * 15
  const extraChildren = children * 10
  return base + extraAdults + extraChildren
}

function computeTotal(room: VirtualRoomType, boardingCode: string, nights: number, adults: number, children: number): number {
  return Math.round(nightlyPrice(room, boardingCode, adults, children) * nights * 1000) / 1000
}

// ---------------------------------------------------------------------------
// ErrorMessage helper — même forme que le vrai myGo (Code/Description)
// ---------------------------------------------------------------------------

function errorMessage(code: number, description: string) {
  return { ErrorMessage: { Code: code, Description: description } }
}

const NO_ERROR = { ErrorMessage: [] as unknown[] }

// ---------------------------------------------------------------------------
// Credential
// ---------------------------------------------------------------------------

function validCredential(body: unknown): boolean {
  const b = body as { Credential?: { Login?: string; Password?: string } }
  return Boolean(b?.Credential?.Login && b?.Credential?.Password)
}

const AUTH_ERROR = errorMessage(401, "Check the sending of the login/password")

// ---------------------------------------------------------------------------
// Static data
// ---------------------------------------------------------------------------

export function handleListCity() {
  return {
    ListCity: VIRTUAL_CITIES.map((c) => ({
      Id: c.id,
      Name: c.name,
      Region: c.region,
      Country: { Id: 219, Name: "Tunisie" },
    })),
    CountResults: VIRTUAL_CITIES.length,
    ...NO_ERROR,
  }
}

export function handleListBoarding() {
  return {
    ListBoarding: VIRTUAL_BOARDINGS.map((b) => ({
      Id: b.id,
      Code: b.code,
      Name: b.name,
      Description: b.description,
    })),
    CountResults: VIRTUAL_BOARDINGS.length,
    ...NO_ERROR,
  }
}

export function handleListCurrency() {
  return { ListCurrency: VIRTUAL_CURRENCIES, ...NO_ERROR }
}

export function handleListTag() {
  return { ListTag: VIRTUAL_TAGS.map((t) => ({ Id: t.id, Title: t.title })), ...NO_ERROR }
}

function hotelSummaryJson(h: VirtualHotel) {
  return {
    Id: h.id,
    Name: h.name,
    Category: { Title: `${h.stars} étoiles`, Star: h.stars },
    City: {
      Id: h.city.id,
      Name: h.city.name,
      Region: h.city.region,
      Country: { Id: 219, Name: "Tunisie" },
    },
    Adress: h.address,
    Image: h.image,
    Localization: { Longitude: String(h.lng), Latitude: String(h.lat) },
    Facilities: h.facilities,
    Theme: h.themes,
    Note: h.note,
  }
}

export function handleListHotel(body: unknown) {
  const b = body as { City?: number }
  const catalog = getCatalog().filter((h) => !b.City || h.city.id === b.City)
  return {
    ListHotel: catalog.map(hotelSummaryJson),
    CountResults: catalog.length,
    ...NO_ERROR,
  }
}

export function handleHotelDetail(body: unknown) {
  const b = body as { Hotel?: number }
  const hotel = b.Hotel ? findHotel(b.Hotel) : undefined
  if (!hotel) return errorMessage(404, "Hotel not found")
  return {
    HotelDetail: {
      ...hotelSummaryJson(hotel),
      Email: `contact@${hotel.name.toLowerCase().replace(/\s+/g, "")}.example`,
      Phone: "+216 71 000 000",
      ShortDescription: `${hotel.name} — établissement ${hotel.stars} étoiles à ${hotel.city.name}, catalogue de simulation Virtual MyGo.`,
      LongDescription: `Hôtel entièrement synthétique généré par le Virtual MyGo Supplier à des fins de test. Situé à ${hotel.city.name} (${hotel.city.region}).`,
      CheckIn: "14:00",
      CheckOut: "12:00",
      Album: [{ Url: hotel.image, Description: hotel.name }],
      Option: [{ Id: 1, Title: "Transfert aéroport (payant)" }],
    },
    ...NO_ERROR,
  }
}

// ---------------------------------------------------------------------------
// HotelSearch
// ---------------------------------------------------------------------------

interface SearchRoomRequest {
  Adult: number
  Child?: number[]
}

export function handleHotelSearch(body: unknown) {
  const b = body as {
    SearchDetails?: {
      BookingDetails?: { CheckIn?: string; CheckOut?: string; City?: number; Hotel?: number }
      Filters?: { OnlyAvailable?: boolean; Category?: number[]; Keywords?: string }
      Rooms?: SearchRoomRequest[]
    }
  }
  const details = b.SearchDetails
  const cityId = details?.BookingDetails?.City
  const checkIn = details?.BookingDetails?.CheckIn
  const checkOut = details?.BookingDetails?.CheckOut
  const hotelFilter = details?.BookingDetails?.Hotel
  const roomRequests = details?.Rooms?.length ? details.Rooms : [{ Adult: 2, Child: [] }]
  const onlyAvailable = details?.Filters?.OnlyAvailable ?? true

  if (!cityId || !checkIn || !checkOut) {
    return errorMessage(400, "Missing City/CheckIn/CheckOut")
  }
  const nights = Math.max(1, nightsBetween(checkIn, checkOut).length)
  const scenario = getScenario()

  const catalog = getCatalog().filter(
    (h) => h.city.id === cityId && (!hotelFilter || h.id === hotelFilter),
  )

  const searchId = newSearchId()
  const results: unknown[] = []

  for (const hotel of catalog) {
    const boardingsOut = hotel.boardings
      .map((boarding) => {
        const paxOut = roomRequests.map((rr) => {
          const adults = rr.Adult
          const children = rr.Child ?? []
          const roomsOut = hotel.rooms
            .filter((r) => r.maxAdults >= adults && r.maxOccupancy >= adults + children.length)
            .map((room) => {
              const avail =
                scenario === "NO_AVAILABILITY"
                  ? 0
                  : Math.min(
                      ...nightsBetween(checkIn, checkOut).map((n) =>
                        currentAvailability(hotel.id, room.id, n),
                      ),
                    )
              const stopReservation = avail <= 0
              if (onlyAvailable && stopReservation) return null
              return {
                Id: room.id,
                Name: room.name,
                Photo: hotel.image,
                Quantity: avail,
                Price: computeTotal(room, boarding.code, nights, adults, children.length),
                StopReservation: stopReservation,
                OnRequest: availabilityLevel(avail) === "LIMITED",
                NotRefundable: false,
                CancellationPolicy: [
                  {
                    Fees: 100,
                    Type: "PERCENT",
                    Nature: "BEFORE_ARRIVAL",
                    FromDate: checkIn,
                  },
                ],
              }
            })
            .filter((r): r is NonNullable<typeof r> => r !== null)
          return { Adult: adults, Child: children, Rooms: roomsOut }
        })
        const hasAnyRoom = paxOut.some((p) => p.Rooms.length > 0)
        if (!hasAnyRoom) return null
        return {
          Id: boarding.id,
          Code: boarding.code,
          Name: boarding.name,
          Description: boarding.description,
          Pax: paxOut,
        }
      })
      .filter((b): b is NonNullable<typeof b> => b !== null)

    if (boardingsOut.length === 0) continue

    const token = issueToken({
      searchId,
      hotelId: hotel.id,
      cityId: hotel.city.id,
      checkIn,
      checkOut,
    })

    results.push({
      Hotel: hotelSummaryJson(hotel),
      Token: token,
      Price: { Boarding: boardingsOut, Currency: "TND" },
      Source: 1,
      Currency: "TND",
      Recommended: hotel.stars >= 4,
    })
  }

  return {
    HotelSearch: results,
    CountResults: results.length,
    SearchId: searchId,
    ...NO_ERROR,
  }
}

// ---------------------------------------------------------------------------
// BookingCreation
// ---------------------------------------------------------------------------

interface BookingRoomRequest {
  Id: number
  Boarding: number
  Pax?: { Adult?: { Civility?: string; Name: string; Surname: string; Holder?: boolean }[]; Child?: { Name: string; Surname: string; Age: number }[] }
}

export async function handleBookingCreation(body: unknown): Promise<{
  status: number
  json: unknown
  delayMs?: number
}> {
  if (!validCredential(body)) return { status: 200, json: AUTH_ERROR }

  const b = body as {
    HotelBooking?: {
      PreBooking?: boolean
      Token?: string
      City?: number
      Hotel?: number
      CheckIn?: string
      CheckOut?: string
      Currency?: string
      Rooms?: BookingRoomRequest[]
    }
  }
  const hb = b.HotelBooking
  const scenario = getScenario()

  if (!hb?.Token || !hb.City || !hb.Hotel || !hb.CheckIn || !hb.CheckOut || !hb.Rooms?.length) {
    return { status: 200, json: errorMessage(400, "Missing mandatory HotelBooking fields") }
  }

  // --- Token ---
  if (scenario === "INVALID_TOKEN") {
    return { status: 200, json: errorMessage(410, "Token expired or invalid") }
  }
  const tokenCheck = validateToken(hb.Token)
  if (!tokenCheck.ok) {
    const desc =
      tokenCheck.reason === "EXPIRED"
        ? "Token expired"
        : tokenCheck.reason === "TAMPERED"
          ? "Token signature invalid"
          : "Malformed token"
    return { status: 200, json: errorMessage(410, desc) }
  }
  if (!matchesBookingContext(tokenCheck.payload, { hotelId: hb.Hotel, cityId: hb.City })) {
    return { status: 200, json: errorMessage(409, "Token does not match requested Hotel/City (room from another search)") }
  }

  // --- Hôtel / Room / Boarding existence ---
  const hotel = findHotel(hb.Hotel)
  if (!hotel) return { status: 200, json: errorMessage(404, "Unknown hotel") }

  const roomReq = hb.Rooms[0]! // l'app réelle ne construit qu'une seule Room aujourd'hui — voir README du harness
  const found = findRoom(hb.Hotel, roomReq.Id)
  const boarding = findBoarding(roomReq.Boarding)
  if (!found || !boarding) {
    return { status: 200, json: errorMessage(422, "Unknown room/boarding for this hotel") }
  }

  if (scenario === "BOOKING_REJECTED") {
    return { status: 200, json: errorMessage(500, "Booking rejected by supplier") }
  }
  if (scenario === "PRICE_CHANGED") {
    return { status: 200, json: errorMessage(409, "Price has changed since search, please refresh") }
  }
  if (scenario === "NO_AVAILABILITY") {
    return { status: 200, json: errorMessage(409, "No availability for this room anymore") }
  }
  if (scenario === "TIMEOUT") {
    // Contrairement à TIMEOUT_AFTER_ACCEPT : aucune mutation n'a eu lieu côté
    // fournisseur — la requête s'est perdue AVANT tout engagement. La
    // réconciliation via ListBookings ne doit rien trouver.
    return { status: 200, json: {}, delayMs: SIMULATED_TIMEOUT_DELAY_MS }
  }

  const adults = roomReq.Pax?.Adult?.length ?? 1
  const children = roomReq.Pax?.Child?.length ?? 0
  const nights = Math.max(1, nightsBetween(hb.CheckIn, hb.CheckOut).length)

  const reserveResult = await reserve(hb.Hotel, roomReq.Id, hb.CheckIn, hb.CheckOut, 1)
  if (!reserveResult.ok) {
    return {
      status: 200,
      json: errorMessage(409, `No availability: ${reserveResult.unavailableNights?.join(", ")}`),
    }
  }

  const totalPrice = computeTotal(found.room, boarding.code, nights, adults, children)
  const currency =
    scenario === "CURRENCY_MISMATCH" ? "EUR" : (hb.Currency ?? "TND")
  const confirmedHotelId = scenario === "HOTEL_ID_MISMATCH" ? hb.Hotel + 1 : hb.Hotel
  const confirmedRoomId = scenario === "ROOM_CHANGED" ? roomReq.Id + 1 : roomReq.Id

  const record = createBookingRecord({
    hotelId: confirmedHotelId,
    hotelName: hotel.name,
    cityId: hotel.city.id,
    cityName: hotel.city.name,
    checkIn: hb.CheckIn,
    checkOut: hb.CheckOut,
    roomId: confirmedRoomId,
    roomName: found.room.name,
    boardingId: boarding.id,
    boardingCode: boarding.code,
    boardingName: boarding.name,
    totalPrice,
    currency,
  })

  if (scenario === "TWO_PLAUSIBLE_CANDIDATES") {
    // Simule un second client ayant réservé le même hôtel/dates à peu près au même moment —
    // ListBookings renverra alors 2 candidats plausibles pour la réconciliation.
    injectBookingRecord({ ...record, id: record.id + 1 })
  }

  const responseJson = {
    Id: record.id,
    // HOTEL_ID_MISMATCH doit se refléter ici — le Hotel confirmé, pas celui demandé.
    Hotel: { ...hotelSummaryJson(hotel), Id: confirmedHotelId },
    CheckIn: hb.CheckIn,
    CheckOut: hb.CheckOut,
    AtHotel: 0,
    Rooms: [
      {
        Id: confirmedRoomId,
        Name: found.room.name,
        Boarding: { Id: boarding.id, Code: boarding.code, Name: boarding.name },
        View: [],
        Supplement: [],
        CancellationPolicy: [
          { Fees: 100, Type: "PERCENT", Nature: "BEFORE_ARRIVAL", FromDate: hb.CheckIn },
        ],
        NotRefundable: false,
        Pax: roomReq.Pax ?? {},
      },
    ],
    Source: 1,
    Currency: currency,
    State: "Validated",
    TotalPrice: totalPrice,
    ...NO_ERROR,
  }

  if (scenario === "MALFORMED_RESPONSE") {
    // Retire un champ obligatoire (TotalPrice) — doit échouer le VRAI schéma Zod côté client.
    const malformed: Record<string, unknown> = { ...responseJson }
    delete malformed.TotalPrice
    return { status: 200, json: malformed }
  }
  if (scenario === "TIMEOUT_AFTER_ACCEPT") {
    // La réservation existe déjà dans le ledger (créée ci-dessus) — seule la
    // RÉPONSE HTTP est retardée, exactement le cas ambigu réel. Le test doit
    // configurer MYGO_TIMEOUT_MS < SIMULATED_TIMEOUT_DELAY_MS pour observer le timeout client.
    return { status: 200, json: responseJson, delayMs: SIMULATED_TIMEOUT_DELAY_MS }
  }

  return { status: 200, json: responseJson }
}

// ---------------------------------------------------------------------------
// BookingCancellation
// ---------------------------------------------------------------------------

export async function handleBookingCancellation(body: unknown): Promise<{
  status: number
  json: unknown
}> {
  if (!validCredential(body)) return { status: 200, json: AUTH_ERROR }
  const b = body as { Booking?: number; PreCancelled?: boolean; Currency?: string }
  const scenario = getScenario()

  if (!b.Booking) return { status: 200, json: errorMessage(400, "Missing Booking id") }

  const record = findBookingById(b.Booking)
  if (!record) return { status: 200, json: errorMessage(404, "Unknown booking reference") }

  if (scenario === "CANCEL_FAILED") {
    return { status: 200, json: errorMessage(500, "Cancellation rejected by supplier") }
  }

  const alreadyCancelled = record.state === "Cancelled"
  const updated = cancelBookingRecord(b.Booking)!
  if (!b.PreCancelled) {
    await release(record.hotelId, record.roomId, record.checkIn, record.checkOut, 1)
  }

  return {
    status: 200,
    json: {
      Booking: updated.id,
      Fee: alreadyCancelled ? 0 : (updated.fee ?? 0),
      Currency: updated.currency,
      PreCancelled: Boolean(b.PreCancelled),
      Nature: "PERCENT",
      Cancelled: updated.cancelledAt,
      ...NO_ERROR,
    },
  }
}

// ---------------------------------------------------------------------------
// BookingList
// ---------------------------------------------------------------------------

export function handleBookingList(body: unknown) {
  const b = body as {
    Filters?: { Booking?: number; Hotel?: number; FromDate?: string; ToDate?: string; State?: StoredBooking["state"] }
  }
  const records = listBookingRecords({
    booking: b.Filters?.Booking,
    hotel: b.Filters?.Hotel,
    fromDate: b.Filters?.FromDate,
    toDate: b.Filters?.ToDate,
    state: b.Filters?.State,
  })
  return {
    BookingDetail: records.map((r) => ({
      Id: r.id,
      Hotel: { Id: r.hotelId, Name: r.hotelName, City: { Id: r.cityId, Name: r.cityName } },
      CheckIn: r.checkIn,
      CheckOut: r.checkOut,
      Rooms: [
        {
          Id: r.roomId,
          Name: r.roomName,
          Boarding: { Id: r.boardingId, Code: r.boardingCode, Name: r.boardingName },
        },
      ],
      Source: 1,
      Currency: r.currency,
      State: r.state,
      TotalPrice: r.totalPrice,
      Created: r.createdAt,
      Cancelled: r.cancelledAt ?? null,
      Fee: r.fee ?? null,
    })),
    ...NO_ERROR,
  }
}
