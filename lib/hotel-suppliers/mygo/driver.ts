/**
 * Driver myGo — implémente HotelSupplierDriver en enveloppant le client
 * myGo EXISTANT (lib/mygo/client.ts, lib/mygo/search-core.ts) sans
 * dupliquer sa logique d'authentification, de retry, de circuit breaker ou
 * de parsing. Sert à la fois de RealMyGoDriver et de VirtualMyGoDriver :
 * le comportement réel/virtuel est déjà entièrement piloté par
 * MYGO_MODE (lib/mygo/config.ts, inchangé) — dupliquer cette bascule dans
 * deux classes distinctes aurait été une régression, pas une abstraction.
 */
import { getMyGoClient } from "@/lib/mygo/client"
import { runHotelSearch, type HotelSearchQuery } from "@/lib/mygo/search-core"
import { getMyGoConfig } from "@/lib/mygo/config"
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
  SupplierCancellationRequest,
  SupplierCancellationResult,
} from "../core/types"
import { SupplierApiError, SupplierNotConfiguredError } from "../core/errors"
import { isMyGoConfigured } from "./config"
import { mapMyGoHotelSummary, mapMyGoOfferToRates, decodeMyGoSupplierToken } from "./mapper"
import { mapHotelDetails } from "@/lib/mygo/mappers"

export class MyGoDriver implements HotelSupplierDriver {
  readonly supplier = "mygo" as const

  getConfigStatus(): "CONFIGURED" | "NOT_CONFIGURED" {
    return isMyGoConfigured() ? "CONFIGURED" : "NOT_CONFIGURED"
  }

  /** Indique si les résultats proviennent du simulateur local — jamais présenté comme une disponibilité réelle (section 26). */
  isVirtualMode(): boolean {
    try {
      return getMyGoConfig().mode === "virtual"
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
    const result = await runHotelSearch(query)
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
    const raw = await getMyGoClient().hotelDetail(hotelId)
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
      const confirmation = await getMyGoClient().createBooking({
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
      return { ok: false, code: "NOT_CONFIGURED", message: "myGo non configuré." }
    }
    if (!request.supplierToken) {
      return { ok: false, code: "SUPPLIER_ERROR", message: "supplierToken myGo manquant pour Book." }
    }
    const decoded = decodeMyGoSupplierToken(request.supplierToken)
    try {
      const confirmation = await getMyGoClient().createBooking({
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
        ok: true,
        supplierBookingReference: String(confirmation.bookingId),
        // confirmation.totalPrice = prix total faisant foi (voir
        // BookingConfirmationDTO) — jamais confirmation.atHotel, qui n'est
        // que la part (souvent 0) à régler à l'hôtel.
        confirmedNetPrice: confirmation.totalPrice,
        currency: confirmation.currency,
        state: confirmation.state === "OnRequest" ? "ON_REQUEST" : "CONFIRMED",
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const name = err instanceof Error ? err.constructor.name : ""
      if (name === "MyGoTimeoutError") return { ok: false, code: "TIMEOUT", message }
      if (name === "MyGoAuthError") return { ok: false, code: "AUTH_ERROR", message }
      if (/no.?availab/i.test(message)) return { ok: false, code: "NO_AVAILABILITY", message }
      if (/price/i.test(message)) return { ok: false, code: "RATE_CHANGED", message }
      return { ok: false, code: "SUPPLIER_ERROR", message }
    }
  }

  async getBooking(request: SupplierBookingLookup): Promise<SupplierBooking> {
    const bookingId = Number(request.supplierBookingReference)
    const list = await getMyGoClient().listBookings({ booking: bookingId })
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
      const result = await getMyGoClient().cancelBooking({
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

export function createMyGoDriver(): MyGoDriver {
  return new MyGoDriver()
}
