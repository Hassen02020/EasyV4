/**
 * Driver myGo — implémente HotelSupplierDriver en enveloppant le client
 * myGo EXISTANT (lib/mygo/client.ts, lib/mygo/search-core.ts) sans
 * dupliquer sa logique d'authentification, de retry, de circuit breaker ou
 * de parsing. Sert à la fois de RealMyGoDriver et de VirtualMyGoDriver :
 * le comportement réel/virtuel est déjà entièrement piloté par
 * MYGO_MODE (lib/mygo/config.ts, inchangé) — dupliquer cette bascule dans
 * deux classes distinctes aurait été une régression, pas une abstraction.
 */
import { getMyGoClient, createMyGoClientForAccount, type MyGoClient } from "@/lib/mygo/client"
import { runHotelSearch, type HotelSearchQuery } from "@/lib/mygo/search-core"
import { getMyGoConfig, type MyGoConfig } from "@/lib/mygo/config"
import type { HotelSupplierDriver, SupplierSearchResult, SupplierHotelDetails } from "../core/supplier"
import type {
  HotelSearchRequest,
  HotelDetailsRequest,
  CheckRateRequest,
  CheckRateResult,
  SupplierBookingRequest,
  SupplierBookingResult,
  SupplierBookingLookup,
  SupplierBooking,
  SupplierBookingReconciliationRequest,
  SupplierBookingReconciliationResult,
  SupplierCancellationRequest,
  SupplierCancellationResult,
} from "../core/types"
import { SupplierApiError, SupplierNotConfiguredError } from "../core/errors"
import { isMyGoConfigured } from "./config"
import { mapMyGoHotelSummary, mapMyGoOfferToRates, decodeMyGoSupplierToken } from "./mapper"
import { mapHotelDetails, mapBookingListItemToConfirmation } from "@/lib/mygo/mappers"
/**
 * PHASE 27.2 — réutilise la classification d'erreur MyGo EXISTANTE (déjà
 * utilisée par Booking Core, lib/booking/actions.ts) plutôt que d'en inventer
 * une seconde qui pourrait diverger avec le temps. `lib/booking/hotel-provider-booking.ts`
 * ne dépend elle-même que de lib/mygo/** — aucun cycle réel introduit.
 */
import { classifyMyGoBookingError, isAmbiguousBookingError, reconcileAmbiguousBooking, type MyGoBookingErrorKind } from "@/lib/booking/hotel-provider-booking"

export class MyGoDriver implements HotelSupplierDriver {
  readonly supplier = "mygo" as const

  /**
   * PHASE 27 — compte fournisseur tenant (identifiants résolus par
   * `resolveSupplierAccount()`), jamais lus depuis l'environnement process
   * quand fournis. Omis => comportement 100% inchangé (compte global
   * `MYGO_*`, singleton `this.client`) — c'est le chemin emprunté par
   * `createMyGoDriver()` (Phase 26, toujours l'unique factory par défaut).
   */
  constructor(
    private readonly client: MyGoClient = getMyGoClient(),
    private readonly configOverride?: MyGoConfig,
  ) {}

  getConfigStatus(): "CONFIGURED" | "NOT_CONFIGURED" {
    return isMyGoConfigured(this.configOverride) ? "CONFIGURED" : "NOT_CONFIGURED"
  }

  /** Indique si les résultats proviennent du simulateur local — jamais présenté comme une disponibilité réelle (section 26). */
  isVirtualMode(): boolean {
    try {
      return getMyGoConfig(this.configOverride).mode === "virtual"
    } catch {
      return false
    }
  }

  async search(request: HotelSearchRequest): Promise<SupplierSearchResult> {
    if (this.getConfigStatus() === "NOT_CONFIGURED") {
      throw new SupplierNotConfiguredError("mygo", "MYGO_LOGIN/MYGO_PASSWORD absents")
    }
    const cityId = Number(request.destinationId)
    if (!Number.isFinite(cityId) || cityId <= 0) {
      throw new SupplierApiError("mygo", `destinationId invalide pour myGo (attendu un cityId numérique): "${request.destinationId}"`)
    }
    const query: HotelSearchQuery = {
      cityId,
      checkin: request.checkIn,
      checkout: request.checkOut,
      adults: request.rooms[0]?.adults ?? 1,
      children: request.rooms[0]?.childAges ?? [],
      currency: request.currency,
      stars: [],
      onlyAvailable: true,
      rooms: request.rooms.length ? request.rooms.map((r) => ({ adults: r.adults, childAges: r.childAges })) : null,
    }
    const result = await runHotelSearch(query, this.configOverride ? { client: this.client } : undefined)
    if (!result.ok) {
      throw new SupplierApiError("mygo", result.message ?? result.error, result)
    }
    const occupancy = { adults: query.adults, childAges: query.children.length ? query.children : undefined }
    const hotels = result.dto.offers.map((o) => mapMyGoHotelSummary(o.hotel))
    const rates = result.dto.offers.flatMap((o) => mapMyGoOfferToRates(o, cityId, occupancy))
    return { hotels, rates }
  }

  async getDetails(request: HotelDetailsRequest): Promise<SupplierHotelDetails> {
    if (this.getConfigStatus() === "NOT_CONFIGURED") {
      throw new SupplierNotConfiguredError("mygo")
    }
    const hotelId = Number(request.supplierHotelCode)
    const raw = await this.client.hotelDetail(hotelId)
    if (!raw) {
      throw new SupplierApiError("mygo", `Hôtel myGo introuvable: ${request.supplierHotelCode}`)
    }
    const detail = mapHotelDetails(raw)
    return {
      hotel: {
        name: detail.name,
        address: detail.address,
        city: detail.cityName,
        latitude: detail.latitude != null ? Number(detail.latitude) : undefined,
        longitude: detail.longitude != null ? Number(detail.longitude) : undefined,
        stars: detail.stars,
        images: detail.album.map((a) => a.url),
        facilities: detail.facilities.map((f) => f.title),
        supplierMappings: [{ supplier: "mygo", supplierHotelCode: String(detail.id) }],
      },
    }
  }

  /**
   * Utilise le dry-run `preBooking:true` déjà supporté par
   * MyGoClient.createBooking — une capacité existante, jamais invoquée
   * jusqu'ici par l'app (voir audit Phase 21.2), pas une invention. Les
   * voyageurs "placeholder" ne sont utilisés que pour cette vérification de
   * prix, jamais persistés ni facturés.
   */
  async checkRate(request: CheckRateRequest): Promise<CheckRateResult> {
    if (this.getConfigStatus() === "NOT_CONFIGURED") {
      return { ok: false, code: "NOT_CONFIGURED", message: "myGo non configuré." }
    }
    if (!request.supplierToken) {
      return { ok: false, code: "SUPPLIER_ERROR", message: "supplierToken myGo manquant pour CheckRate." }
    }
    const decoded = decodeMyGoSupplierToken(request.supplierToken)
    const totalAdults = request.rooms.reduce((sum, r) => sum + r.adults, 0)
    try {
      const confirmation = await this.client.createBooking({
        token: decoded.searchToken,
        cityId: decoded.cityId,
        hotelId: decoded.hotelId,
        checkIn: request.checkIn,
        checkOut: request.checkOut,
        preBooking: true,
        rooms: [
          {
            roomId: decoded.roomId,
            boardingId: decoded.boardingId,
            adults: Array.from({ length: totalAdults || 1 }, (_, i) => ({
              civility: "M",
              name: "Verification",
              surname: `Rate${i + 1}`,
              holder: i === 0,
            })),
          },
        ],
      })
      // confirmation.totalPrice = prix total faisant foi (voir BookingConfirmationDTO) ;
      // confirmation.atHotel n'est QUE la part à régler à l'hôtel (souvent 0
      // pour un paiement classique) — ne jamais l'utiliser comme prix total.
      const newRate = confirmation.totalPrice
      return {
        ok: true,
        priceChanged: false,
        rate: {
          hotelId: String(decoded.hotelId),
          supplier: "mygo",
          supplierHotelCode: String(decoded.hotelId),
          supplierRateCode: request.supplierRateCode,
          roomId: request.roomId,
          roomName: request.roomId,
          occupancy: request.rooms[0] ?? { adults: totalAdults },
          currency: confirmation.currency,
          netPrice: newRate,
          sellingPrice: newRate,
          cancellationPolicy: { type: "UNKNOWN" },
          refundable: true,
          availability: "AVAILABLE",
          supplierToken: request.supplierToken,
        },
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (/no.?availab/i.test(message)) {
        return { ok: false, code: "NO_AVAILABILITY", message }
      }
      if (/price/i.test(message)) {
        return { ok: false, code: "RATE_CHANGED", message }
      }
      return { ok: false, code: "SUPPLIER_ERROR", message }
    }
  }

  async book(request: SupplierBookingRequest): Promise<SupplierBookingResult> {
    if (this.getConfigStatus() === "NOT_CONFIGURED") {
      return { outcome: "DEFINITIVE_FAILURE", code: "NOT_CONFIGURED", message: "myGo non configuré." }
    }
    if (!request.supplierToken) {
      return { outcome: "DEFINITIVE_FAILURE", code: "SUPPLIER_ERROR", message: "supplierToken myGo manquant pour Book." }
    }
    const decoded = decodeMyGoSupplierToken(request.supplierToken)
    try {
      const confirmation = await this.client.createBooking({
        token: decoded.searchToken,
        cityId: decoded.cityId,
        hotelId: decoded.hotelId,
        checkIn: request.checkIn,
        checkOut: request.checkOut,
        rooms: [
          {
            roomId: decoded.roomId,
            boardingId: decoded.boardingId,
            adults: request.travelers
              .filter((t) => t.age == null)
              .map((t) => ({ civility: t.civility ?? "M", name: t.firstName, surname: t.lastName, holder: t.isHolder ?? false })),
            children: request.travelers
              .filter((t) => t.age != null)
              .map((t) => ({ name: t.firstName, surname: t.lastName, age: t.age as number })),
          },
        ],
      })
      return {
        outcome: "SUCCESS",
        supplierBookingReference: String(confirmation.bookingId),
        // confirmation.totalPrice = prix total faisant foi (voir
        // BookingConfirmationDTO) — jamais confirmation.atHotel, qui n'est
        // que la part (souvent 0) à régler à l'hôtel.
        confirmedNetPrice: confirmation.totalPrice,
        currency: confirmation.currency,
        state: confirmation.state === "OnRequest" ? "ON_REQUEST" : "CONFIRMED",
        hotelId: confirmation.hotelId != null ? String(confirmation.hotelId) : undefined,
      }
    } catch (err) {
      return classifyBookOutcome(err)
    }
  }

  /**
   * PHASE 27.2 — best-effort, lecture seule : réutilise `listBookings()`
   * (déjà utilisé par la réconciliation existante,
   * lib/booking/actions.ts::tryReconcileAmbiguousBooking) et la MÊME
   * fonction pure de correspondance `reconcileAmbiguousBooking` — aucune
   * seconde logique de réconciliation inventée.
   */
  async reconcileBooking(request: SupplierBookingReconciliationRequest): Promise<SupplierBookingReconciliationResult> {
    if (this.getConfigStatus() === "NOT_CONFIGURED") {
      return { outcome: "UNSUPPORTED" }
    }
    const hotelId = Number(request.supplierHotelCode)
    if (!Number.isFinite(hotelId) || hotelId <= 0) {
      return { outcome: "UNSUPPORTED" }
    }
    try {
      const list = await this.client.listBookings({
        hotel: hotelId,
        fromDate: request.checkIn,
        toDate: request.checkIn,
      })
      const match = reconcileAmbiguousBooking(
        list.map((b) => ({
          bookingId: b.Id,
          hotelId: b.Hotel?.Id,
          checkIn: b.CheckIn,
          checkOut: b.CheckOut,
          state: b.State,
          createdAt: b.Created,
        })),
        { hotelId, checkIn: request.checkIn, checkOut: request.checkOut },
        Date.now(),
        request.windowMinutes,
      )
      if (!match) return { outcome: "NOT_FOUND" }
      const full = list.find((b) => b.Id === match.bookingId)
      if (!full) return { outcome: "NOT_FOUND" }
      const confirmation = mapBookingListItemToConfirmation(full)
      return {
        outcome: "FOUND",
        supplierBookingReference: String(confirmation.bookingId),
        confirmedNetPrice: confirmation.totalPrice,
        currency: confirmation.currency,
        state: confirmation.state === "OnRequest" ? "ON_REQUEST" : "CONFIRMED",
        hotelId: confirmation.hotelId != null ? String(confirmation.hotelId) : undefined,
      }
    } catch {
      // La réconciliation elle-même a échoué (réseau/timeout sur BookingList)
      // — l'état reste incertain, jamais "certainement pas créée".
      return { outcome: "STILL_AMBIGUOUS", message: "Impossible d'interroger BookingList pour réconcilier — état toujours incertain." }
    }
  }

  async getBooking(request: SupplierBookingLookup): Promise<SupplierBooking> {
    const bookingId = Number(request.supplierBookingReference)
    const list = await this.client.listBookings({ booking: bookingId })
    const row = list[0]
    if (!row) {
      return { supplierBookingReference: request.supplierBookingReference, state: "UNKNOWN" }
    }
    const stateMap: Record<string, SupplierBooking["state"]> = {
      Validated: "CONFIRMED",
      OnRequest: "ON_REQUEST",
      Cancelled: "CANCELLED",
    }
    return {
      supplierBookingReference: String(row.Id),
      state: (row.State && stateMap[row.State]) ?? "UNKNOWN",
      hotelId: row.Hotel ? String(row.Hotel.Id) : undefined,
      checkIn: row.CheckIn,
      checkOut: row.CheckOut,
      currency: row.Currency,
      amount: row.TotalPrice != null ? Number(row.TotalPrice) : undefined,
    }
  }

  async cancel(request: SupplierCancellationRequest): Promise<SupplierCancellationResult> {
    if (this.getConfigStatus() === "NOT_CONFIGURED") {
      return { ok: false, code: "NOT_CONFIGURED", message: "myGo non configuré." }
    }
    try {
      const result = await this.client.cancelBooking({
        bookingId: Number(request.supplierBookingReference),
        preCancelled: request.dryRun,
      })
      return {
        ok: true,
        supplierBookingReference: String(result.bookingId),
        state: "CANCELLED",
        penaltyAmount: result.fee,
        penaltyCurrency: result.currency,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const name = err instanceof Error ? err.constructor.name : ""
      if (name === "MyGoTimeoutError") return { ok: false, code: "TIMEOUT", message }
      if (name === "MyGoAuthError") return { ok: false, code: "AUTH_ERROR", message }
      return { ok: false, code: "SUPPLIER_ERROR", message }
    }
  }
}

/**
 * PHASE 27.2 — traduit `MyGoBookingErrorKind` (classification EXISTANTE de
 * Booking Core, voir hotel-provider-booking.ts) vers le résultat discriminé
 * du Hub. `isAmbiguousBookingError()` reste la SEULE source de vérité pour
 * "ambigu ou non" — ne jamais dupliquer ce jugement ici avec une logique
 * différente.
 */
function classifyBookOutcome(err: unknown): SupplierBookingResult {
  const kind: MyGoBookingErrorKind = classifyMyGoBookingError(err)
  const message = err instanceof Error ? err.message : String(err)

  if (isAmbiguousBookingError(kind)) {
    const code = kind === "TIMEOUT" ? "TIMEOUT" : kind === "MALFORMED_RESPONSE" ? "MALFORMED_RESPONSE" : "NETWORK_ERROR"
    return { outcome: "AMBIGUOUS", code, message }
  }

  switch (kind) {
    case "AUTHENTICATION_ERROR":
      return { outcome: "DEFINITIVE_FAILURE", code: "AUTH_ERROR", message }
    case "NO_AVAILABILITY":
      return { outcome: "DEFINITIVE_FAILURE", code: "NO_AVAILABILITY", message }
    case "PRICE_CHANGED":
      return { outcome: "DEFINITIVE_FAILURE", code: "RATE_CHANGED", message }
    default:
      // CIRCUIT_OPEN, MYGO_BUSINESS_ERROR, UNKNOWN_ERROR — jamais classés
      // ambigus par la classification existante ; on ne diverge pas d'elle.
      return { outcome: "DEFINITIVE_FAILURE", code: "SUPPLIER_ERROR", message }
  }
}

export function createMyGoDriver(): MyGoDriver {
  return new MyGoDriver()
}

/**
 * PHASE 27 — Driver MyGo pour UN compte fournisseur tenant précis (master,
 * agence ou marque blanche). Toujours la MÊME classe `MyGoDriver` (jamais de
 * `MyGoAgencyDriver`/`MyGoWhiteLabelDriver`) — seul le client HTTP sous-jacent
 * change, via `createMyGoClientForAccount` (breaker Redis dédié à ce compte,
 * cache de données statiques namespacé). `accountId` et `config` proviennent
 * TOUJOURS de `resolveSupplierAccount()` — jamais construits ailleurs.
 */
export function createMyGoDriverForAccount(accountId: string, config: MyGoConfig): MyGoDriver {
  return new MyGoDriver(createMyGoClientForAccount(accountId, config), config)
}
