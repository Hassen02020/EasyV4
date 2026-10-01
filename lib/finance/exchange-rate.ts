import "server-only"

export interface ExchangeRate {
  from: string
  to: string
  rate: number
  source: string
  capturedAt: Date
}

export interface ExchangeRateProvider {
  getRate(from: string, to: string): Promise<ExchangeRate>
}

export interface FetchExchangeRateOptions {
  provider?: ExchangeRateProvider
  /** Maximum age of an in-memory cached provider result. 0 = no cache. */
  cacheTtlMs?: number
}

const DEFAULT_CACHE_TTL_MS = 0
const cache = new Map<string, { value: ExchangeRate; cachedAtMs: number }>()

function normalizeCurrency(value: string): string {
  const currency = value.trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new ExchangeRateError(`Devise ISO 4217 invalide: ${value}`, "INVALID_CURRENCY")
  }
  return currency
}

function validateRate(value: ExchangeRate, from: string, to: string): ExchangeRate {
  if (value.from !== from || value.to !== to) {
    throw new ExchangeRateError(
      `Le provider a retourné ${value.from}/${value.to} au lieu de ${from}/${to}`,
      "PROVIDER_RESPONSE_MISMATCH",
    )
  }
  if (!Number.isFinite(value.rate) || value.rate <= 0) {
    throw new ExchangeRateError("Le provider a retourné un taux non valide", "INVALID_RATE")
  }
  if (!(value.capturedAt instanceof Date) || Number.isNaN(value.capturedAt.getTime())) {
    throw new ExchangeRateError("Le provider a retourné un horodatage invalide", "INVALID_TIMESTAMP")
  }
  return value
}

export class ExchangeRateError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "INVALID_CURRENCY"
      | "PROVIDER_NOT_CONFIGURED"
      | "PROVIDER_UNAVAILABLE"
      | "PROVIDER_RESPONSE_MISMATCH"
      | "INVALID_RATE"
      | "INVALID_TIMESTAMP",
  ) {
    super(message)
    this.name = "ExchangeRateError"
  }
}

class ExchangeRateApiProvider implements ExchangeRateProvider {
  async getRate(from: string, to: string): Promise<ExchangeRate> {
    const apiKey = process.env.EXCHANGE_RATE_API_KEY?.trim()
    if (!apiKey) {
      throw new ExchangeRateError(
        "EXCHANGE_RATE_API_KEY est requis pour le provider exchangerate-api",
        "PROVIDER_NOT_CONFIGURED",
      )
    }

    const url = `https://v6.exchangerate-api.com/v6/pair/${encodeURIComponent(apiKey)}/${from}/${to}`

    let response: Response
    try {
      response = await fetch(url, {
        method: "GET",
        headers: { accept: "application/json" },
        cache: "no-store",
      })
    } catch (error) {
      throw new ExchangeRateError(
        `Provider FX indisponible: ${error instanceof Error ? error.message : String(error)}`,
        "PROVIDER_UNAVAILABLE",
      )
    }

    if (!response.ok) {
      throw new ExchangeRateError(
        `Provider FX HTTP ${response.status}`,
        "PROVIDER_UNAVAILABLE",
      )
    }

    let body: unknown
    try {
      body = await response.json()
    } catch {
      throw new ExchangeRateError("Réponse JSON FX invalide", "PROVIDER_UNAVAILABLE")
    }

    if (
      typeof body !== "object" ||
      body === null ||
      !("result" in body) ||
      body.result !== "success"
    ) {
      const errorType =
        typeof body === "object" &&
        body !== null &&
        "error-type" in body &&
        typeof body["error-type"] === "string"
          ? body["error-type"]
          : "unknown"
      throw new ExchangeRateError(
        `Provider FX a refusé la requête: ${errorType}`,
        "PROVIDER_UNAVAILABLE",
      )
    }

    const data = body as {
      base_code?: unknown
      target_code?: unknown
      conversion_rate?: unknown
      time_last_update_unix?: unknown
    }

    const capturedAtMs =
      typeof data.time_last_update_unix === "number"
        ? data.time_last_update_unix * 1000
        : typeof data.time_last_update_unix === "string"
          ? Number(data.time_last_update_unix) * 1000
          : Number.NaN

    return validateRate(
      {
        from,
        to,
        rate: Number(data.conversion_rate),
        source: "exchangerate-api",
        capturedAt: new Date(capturedAtMs),
      },
      from,
      to,
    )
  }
}

function configuredProvider(): ExchangeRateProvider {
  const provider = process.env.EXCHANGE_RATE_PROVIDER?.trim().toLowerCase()

  if (!provider || provider === "exchangerate-api") {
    return new ExchangeRateApiProvider()
  }

  throw new ExchangeRateError(
    `Provider FX non supporté: ${provider}. Seul "exchangerate-api" est configuré en production.`,
    "PROVIDER_NOT_CONFIGURED",
  )
}

export function clearExchangeRateCache(): void {
  cache.clear()
}

/**
 * Retourne le taux "1 FROM = X TO".
 *
 * Le cache est explicitement opt-in via cacheTtlMs. Pour un engagement
 * économique/booking, laisser cacheTtlMs à 0 afin de ne pas réutiliser un
 * taux de recherche. Après capture dans reservation_financials, le taux ne
 * doit plus être recalculé.
 */
export async function fetchExchangeRate(
  fromInput: string,
  toInput: string,
  options: FetchExchangeRateOptions = {},
): Promise<ExchangeRate> {
  const from = normalizeCurrency(fromInput)
  const to = normalizeCurrency(toInput)

  if (from === to) {
    return {
      from,
      to,
      rate: 1,
      source: "identity",
      capturedAt: new Date(),
    }
  }

  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS
  if (!Number.isFinite(cacheTtlMs) || cacheTtlMs < 0) {
    throw new ExchangeRateError("cacheTtlMs doit être un nombre >= 0", "INVALID_RATE")
  }

  const key = `${from}:${to}`
  const cached = cache.get(key)
  if (cached && cacheTtlMs > 0 && Date.now() - cached.cachedAtMs < cacheTtlMs) {
    return cached.value
  }

  const provider = options.provider ?? configuredProvider()
  const value = validateRate(await provider.getRate(from, to), from, to)

  if (cacheTtlMs > 0) {
    cache.set(key, { value, cachedAtMs: Date.now() })
  }

  return value
}
