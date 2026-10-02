/**
 * CURRENCY-DIM-01 — Module de taux de change réel injectable.
 *
 * Règle permanente (CLAUDE.md § RÈGLE FINANCIÈRE) : un prix financier ne
 * doit JAMAIS être calculé avec un taux inventé. Ce module applique cette
 * règle : si le provider est indisponible ou la clé absente, on lève
 * ExchangeRateUnavailableError — jamais de fallback sur 1.0 ou un taux
 * codé en dur.
 *
 * Architecture :
 *  - ExchangeRateProvider : interface injectable → tests utilisent createMockProvider()
 *  - createExchangeRateApiProvider() : implémentation réelle (exchangerate-api.com v6)
 *  - fetchExchangeRateForDisplay() : cache Redis/mémoire ≤ TTL, indicatif
 *  - fetchExchangeRateForBooking() : toujours frais, aucun cache, verrouillé au moment
 *    du booking (D2 : Option B — taux verrouillé au booking)
 *
 * Configuration :
 *  EXCHANGE_RATE_PROVIDER=exchangerate-api  (défaut)
 *  EXCHANGE_RATE_API_KEY=<clé>
 */

import { memoize } from "@/lib/cache/redis"

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

export interface ExchangeRate {
  from: string
  to: string
  /** Taux à 4 décimales : 1 FROM = rate TO. Décision Direction 2026-10-01. */
  rate: number
  /** Nom du provider ayant fourni ce taux ("exchangerate-api", "mock", "identity"). */
  source: string
  capturedAt: Date
}

export interface ExchangeRateProvider {
  name: string
  fetchRate(from: string, to: string): Promise<ExchangeRate>
}

/* -------------------------------------------------------------------------- */
/* Erreur fail-closed                                                          */
/* -------------------------------------------------------------------------- */

export class ExchangeRateUnavailableError extends Error {
  constructor(
    public readonly from: string,
    public readonly to: string,
    public readonly reason: string,
  ) {
    super(
      `Taux de change ${from}→${to} indisponible (${reason}). ` +
        `Opération refusée — jamais de taux inventé (CURRENCY-DIM-01, règle Direction 2026-10-01).`,
    )
    this.name = "ExchangeRateUnavailableError"
  }
}

/* -------------------------------------------------------------------------- */
/* Provider réel : exchangerate-api.com v6                                    */
/* -------------------------------------------------------------------------- */

export function createExchangeRateApiProvider(): ExchangeRateProvider {
  return {
    name: "exchangerate-api",

    async fetchRate(from: string, to: string): Promise<ExchangeRate> {
      const apiKey = process.env.EXCHANGE_RATE_API_KEY
      if (!apiKey) {
        throw new ExchangeRateUnavailableError(
          from,
          to,
          "EXCHANGE_RATE_API_KEY absent",
        )
      }

      const url = `https://v6.exchangerate-api.com/v6/${apiKey}/pair/${from}/${to}`
      let res: Response
      try {
        res = await fetch(url, { cache: "no-store" })
      } catch (err) {
        throw new ExchangeRateUnavailableError(
          from,
          to,
          `réseau: ${String(err)}`,
        )
      }

      if (!res.ok) {
        throw new ExchangeRateUnavailableError(from, to, `HTTP ${res.status}`)
      }

      let body: unknown
      try {
        body = await res.json()
      } catch {
        throw new ExchangeRateUnavailableError(
          from,
          to,
          "réponse JSON invalide",
        )
      }

      const data = body as Record<string, unknown>
      if (
        data["result"] !== "success" ||
        typeof data["conversion_rate"] !== "number"
      ) {
        throw new ExchangeRateUnavailableError(
          from,
          to,
          `réponse inattendue: ${JSON.stringify(data).slice(0, 200)}`,
        )
      }

      const rawRate = data["conversion_rate"] as number
      const rate = Math.round(rawRate * 10000) / 10000

      return {
        from,
        to,
        rate,
        source: "exchangerate-api",
        capturedAt: new Date(),
      }
    },
  }
}

/* -------------------------------------------------------------------------- */
/* Provider mock — tests uniquement                                            */
/* -------------------------------------------------------------------------- */

/**
 * Crée un provider déterministe pour les tests.
 * rates : { "USD/TND": 3.1052, "EUR/TND": 3.3500, ... }
 */
export function createMockProvider(
  rates: Record<string, number>,
): ExchangeRateProvider {
  return {
    name: "mock",

    async fetchRate(from: string, to: string): Promise<ExchangeRate> {
      const key = `${from}/${to}`
      const rate = rates[key]
      if (rate === undefined) {
        throw new ExchangeRateUnavailableError(
          from,
          to,
          `mock: taux "${key}" absent`,
        )
      }
      return {
        from,
        to,
        rate: Math.round(rate * 10000) / 10000,
        source: "mock",
        capturedAt: new Date(),
      }
    },
  }
}

/* -------------------------------------------------------------------------- */
/* Résolution du provider actif                                                */
/* -------------------------------------------------------------------------- */

let _overrideProvider: ExchangeRateProvider | null = null

/**
 * Injecte un provider personnalisé (tests ou environnement spécifique).
 * Appeler avec null pour revenir au comportement par défaut.
 */
export function setExchangeRateProvider(
  provider: ExchangeRateProvider | null,
): void {
  _overrideProvider = provider
}

function getActiveProvider(): ExchangeRateProvider {
  if (_overrideProvider) return _overrideProvider
  const name = process.env.EXCHANGE_RATE_PROVIDER ?? "exchangerate-api"
  if (name === "exchangerate-api") return createExchangeRateApiProvider()
  throw new ExchangeRateUnavailableError(
    "?",
    "?",
    `provider inconnu: "${name}"`,
  )
}

/* -------------------------------------------------------------------------- */
/* API publique                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Taux indicatif pour l'affichage — mis en cache Redis/mémoire jusqu'à ttlSeconds.
 * D3 : TTL ≤ 1h (3600 s par défaut).
 *
 * Identité : si from === to, retourne rate=1 sans appel réseau.
 */
export async function fetchExchangeRateForDisplay(
  from: string,
  to: string,
  ttlSeconds = 3600,
): Promise<ExchangeRate> {
  if (from === to) {
    return { from, to, rate: 1, source: "identity", capturedAt: new Date() }
  }

  const provider = getActiveProvider()
  const cacheKey = `exchange-rate:display:${provider.name}:${from}:${to}`

  return memoize(cacheKey, ttlSeconds, () => provider.fetchRate(from, to))
}

/**
 * Taux frais pour le booking — aucun cache, toujours une nouvelle requête.
 * D2 : Option B — taux verrouillé au moment du booking, jamais réutilisé.
 *
 * Identité : si from === to, retourne rate=1 sans appel réseau.
 */
export async function fetchExchangeRateForBooking(
  from: string,
  to: string,
): Promise<ExchangeRate> {
  if (from === to) {
    return { from, to, rate: 1, source: "identity", capturedAt: new Date() }
  }

  const provider = getActiveProvider()
  return provider.fetchRate(from, to)
}
