/**
 * Client myGo: requêtes JSON vers https://admin.mygo.co/api/hotel/{Method}.
 *
 * Robustesse :
 * - Timeout par requête (AbortController)
 * - Retries exponentiels sur erreurs réseau / 5xx (3 tentatives par défaut)
 * - Circuit breaker partagé (5 échecs en 60s → open 2min)
 * - Validation Zod des réponses
 * - Détection des erreurs métier myGo (`ErrorMessage.Code`)
 * - Cache mémoire pour les données statiques (TTL 24h par défaut)
 */

import { ZodError, ZodTypeAny } from "zod"
import { getMyGoConfig } from "./config"
import {
  MyGoApiError,
  MyGoAuthError,
  MyGoCircuitOpenError,
  MyGoNetworkError,
  MyGoSchemaError,
  MyGoTimeoutError,
} from "./errors"
import {
  CircuitBreaker,
  getSharedCircuitBreaker,
} from "./circuit-breaker"
import { memoize } from "./cache"
import {
  HotelDetailResponse,
  HotelSearchResponse,
  ListBoardingResponse,
  ListCityResponse,
  ListCurrencyResponse,
  ListHotelResponse,
  ListTagResponse,
  type HotelDetailItemT,
  type HotelSearchResultItemT,
  type ListBoardingItemT,
  type ListCityItemT,
  type ListCurrencyItemT,
  type ListHotelItemT,
  type ListTagItemT,
} from "./schemas"

// ---------------------------------------------------------------------------
// Public types for callers (route handlers, server components)
// ---------------------------------------------------------------------------

export interface HotelSearchInput {
  cityId: number
  checkIn: string // YYYY-MM-DD
  checkOut: string // YYYY-MM-DD
  rooms: { adults: number; childAges?: number[] }[]
  currency?: string
  hotelId?: number
  filters?: {
    keywords?: string
    categories?: number[]
    onlyAvailable?: boolean
    tags?: number[]
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

const isAuthError = (description?: string): boolean => {
  if (!description) return false
  return /login|password|credential|connect/i.test(description)
}

interface CallOptions {
  cacheKey?: string
  cacheTtlSeconds?: number
}

/**
 * `MyGoClient` est volontairement stateless (lit la config au runtime).
 * Réutilisable côté serveur (route handlers, server components, server actions).
 */
export class MyGoClient {
  constructor(private readonly breaker: CircuitBreaker = getSharedCircuitBreaker()) {}

  // -------------------------------------------------------------------------
  // Static data
  // -------------------------------------------------------------------------

  listCities(): Promise<ListCityItemT[]> {
    return this.cachedCall("ListCity", {}, ListCityResponse, (r) => r.ListCity ?? [], {
      cacheKey: "mygo:cities",
      cacheTtlSeconds: getMyGoConfig().staticDataTtlSeconds,
    })
  }

  listBoardings(): Promise<ListBoardingItemT[]> {
    return this.cachedCall(
      "ListBoarding",
      {},
      ListBoardingResponse,
      (r) => r.ListBoarding ?? [],
      {
        cacheKey: "mygo:boardings",
        cacheTtlSeconds: getMyGoConfig().staticDataTtlSeconds,
      },
    )
  }

  listCurrencies(): Promise<ListCurrencyItemT[]> {
    return this.cachedCall(
      "ListCurrency",
      {},
      ListCurrencyResponse,
      (r) => r.ListCurrency ?? [],
      {
        cacheKey: "mygo:currencies",
        cacheTtlSeconds: getMyGoConfig().staticDataTtlSeconds,
      },
    )
  }

  listTags(): Promise<ListTagItemT[]> {
    return this.cachedCall("ListTag", {}, ListTagResponse, (r) => r.ListTag ?? [], {
      cacheKey: "mygo:tags",
      cacheTtlSeconds: getMyGoConfig().staticDataTtlSeconds,
    })
  }

  /** Liste des hôtels d'une ville (statique). */
  listHotels(cityId?: number): Promise<ListHotelItemT[]> {
    const body = cityId ? { City: cityId } : {}
    return this.cachedCall("ListHotel", body, ListHotelResponse, (r) => r.ListHotel ?? [], {
      cacheKey: `mygo:hotels:${cityId ?? "all"}`,
      cacheTtlSeconds: getMyGoConfig().staticDataTtlSeconds,
    })
  }

  /** Détails complets d'un hôtel (Album, Options, descriptions longues). */
  hotelDetail(hotelId: number): Promise<HotelDetailItemT | null> {
    return this.cachedCall(
      "HotelDetail",
      { Hotel: hotelId },
      HotelDetailResponse,
      (r) => r.HotelDetail ?? null,
      {
        cacheKey: `mygo:hotel:${hotelId}`,
        cacheTtlSeconds: getMyGoConfig().staticDataTtlSeconds,
      },
    )
  }

  // -------------------------------------------------------------------------
  // Search
  // -------------------------------------------------------------------------

  searchHotels(input: HotelSearchInput): Promise<{
    hotels: HotelSearchResultItemT[]
    searchId: string | null
    count: number
  }> {
    const body = {
      SearchDetails: {
        BookingDetails: {
          CheckIn: input.checkIn,
          CheckOut: input.checkOut,
          City: input.cityId,
          ...(input.hotelId ? { Hotel: input.hotelId } : {}),
        },
        ...(input.currency ? { Currency: input.currency } : {}),
        Filters: {
          ...(input.filters?.keywords ? { Keywords: input.filters.keywords } : {}),
          ...(input.filters?.categories?.length
            ? { Category: input.filters.categories }
            : {}),
          OnlyAvailable: input.filters?.onlyAvailable ?? true,
          ...(input.filters?.tags?.length ? { Tags: input.filters.tags } : {}),
        },
        Rooms: input.rooms.map((r) => ({
          Adult: r.adults,
          ...(r.childAges?.length ? { Child: r.childAges } : {}),
        })),
      },
    }
    const cacheKey = `mygo:search:${stableHash(body)}`
    return this.cachedCall(
      "HotelSearch",
      body,
      HotelSearchResponse,
      (r) => ({
        hotels: r.HotelSearch ?? [],
        searchId: r.SearchId ?? null,
        count: r.CountResults ?? (r.HotelSearch?.length ?? 0),
      }),
      {
        cacheKey,
        cacheTtlSeconds: getMyGoConfig().searchTtlSeconds,
      },
    )
  }

  // -------------------------------------------------------------------------
  // Internal: HTTP call with retries / circuit / cache
  // -------------------------------------------------------------------------

  private async cachedCall<S extends ZodTypeAny, R>(
    method: string,
    body: Record<string, unknown>,
    schema: S,
    extract: (parsed: import("zod").infer<S>) => R,
    options: CallOptions = {},
  ): Promise<R> {
    const loader = () => this.callOnce(method, body, schema).then(extract)
    if (options.cacheKey && options.cacheTtlSeconds && options.cacheTtlSeconds > 0) {
      return memoize(options.cacheKey, options.cacheTtlSeconds, loader)
    }
    return loader()
  }

  private async callOnce<S extends ZodTypeAny>(
    method: string,
    body: Record<string, unknown>,
    schema: S,
  ): Promise<import("zod").infer<S>> {
    const cfg = getMyGoConfig()

    if (this.breaker.isOpen()) {
      const reopensAt = this.breaker.getReopensAt() ?? new Date()
      throw new MyGoCircuitOpenError(reopensAt)
    }

    const url = `${cfg.baseUrl}/${method}`
    const fullBody = {
      Credential: { Login: cfg.login, Password: cfg.password },
      ...body,
    }
    let lastError: unknown = null

    for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
      try {
        const json = await this.httpJson(url, fullBody, cfg.timeoutMs)

        const parse = schema.safeParse(json)
        if (!parse.success) {
          throw new MyGoSchemaError(method, (parse.error as ZodError).issues)
        }
        const parsed = parse.data as Record<string, unknown>

        // Détection erreur applicative
        const errMsg = parsed["ErrorMessage"]
        if (
          errMsg &&
          typeof errMsg === "object" &&
          !Array.isArray(errMsg) &&
          "Code" in errMsg
        ) {
          const e = errMsg as { Code?: number; Description?: string }
          if (e.Code && e.Code !== 0) {
            if (isAuthError(e.Description)) {
              throw new MyGoAuthError(
                e.Description ?? "Authentication failed against myGo API",
              )
            }
            throw new MyGoApiError(method, e.Code, e.Description ?? "Unknown myGo error")
          }
        }

        this.breaker.onSuccess()
        return parsed as import("zod").infer<S>
      } catch (err) {
        lastError = err

        // Erreurs métier non-retryables → on arrête tout de suite
        if (
          err instanceof MyGoAuthError ||
          err instanceof MyGoApiError ||
          err instanceof MyGoSchemaError ||
          err instanceof MyGoCircuitOpenError
        ) {
          throw err
        }

        // Erreurs réseau / timeout / 5xx → on retry avec backoff
        const isLast = attempt === cfg.maxRetries
        if (isLast) {
          this.breaker.onFailure()
          throw err
        }
        const backoffMs = Math.min(8000, 500 * 2 ** attempt)
        await sleep(backoffMs)
      }
    }

    // Inaccessible normalement
    this.breaker.onFailure()
    throw lastError instanceof Error
      ? lastError
      : new MyGoNetworkError("Unknown myGo client error")
  }

  private async httpJson(
    url: string,
    body: unknown,
    timeoutMs: number,
  ): Promise<unknown> {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
        // Next.js: pas de cache framework — on gère le cache nous-mêmes
        cache: "no-store",
      })
      if (!resp.ok) {
        // 5xx retryable, 4xx non
        if (resp.status >= 500) {
          throw new MyGoNetworkError(`myGo HTTP ${resp.status}`)
        }
        throw new MyGoApiError("HTTP", resp.status, `myGo HTTP ${resp.status}`)
      }
      return await resp.json()
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") {
        throw new MyGoTimeoutError(timeoutMs)
      }
      if (err instanceof MyGoApiError || err instanceof MyGoNetworkError) {
        throw err
      }
      throw new MyGoNetworkError(
        err instanceof Error ? err.message : "Unknown network error",
        err,
      )
    } finally {
      clearTimeout(t)
    }
  }
}

/** Fast deterministic hash of an object — stable across runs. */
function stableHash(obj: unknown): string {
  const json = JSON.stringify(obj, Object.keys(obj as object).sort())
  let h = 5381
  for (let i = 0; i < json.length; i++) h = (h * 33) ^ json.charCodeAt(i)
  return (h >>> 0).toString(36)
}

let sharedClient: MyGoClient | null = null
export function getMyGoClient(): MyGoClient {
  if (!sharedClient) sharedClient = new MyGoClient()
  return sharedClient
}
