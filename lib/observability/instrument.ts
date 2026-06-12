/**
 * instrument() — Easy2Book SRE
 *
 * Wrapper générique qui mesure latence + taux succès de n'importe quelle
 * fonction async et publie les métriques + logs structurés automatiquement.
 *
 * Usage :
 * ```ts
 * const result = await instrument("mygo.search", () =>
 *   client.searchHotels(input)
 * )
 * ```
 *
 * Publie automatiquement :
 *  - metrics.timing("<name>.latency_ms", ms)
 *  - metrics.slo("<name>", ok)
 *  - metrics.incr("<name>.ok") ou metrics.incr("<name>.error")
 *  - logger.info / logger.error avec contexte structuré
 */

import { logger } from "@/lib/logger"
import { metrics } from "./metrics"

export type InstrumentOptions = {
  /** Loguer le succès (défaut: false — évite le bruit en prod) */
  logSuccess?: boolean
  /** Contexte additionnel injecté dans les logs */
  ctx?: Record<string, unknown>
}

export async function instrument<T>(
  name: string,
  fn: () => Promise<T>,
  opts: InstrumentOptions = {},
): Promise<T> {
  const t0 = Date.now()
  try {
    const result = await fn()
    const ms = Date.now() - t0

    // Métriques fire-and-forget
    void metrics.timing(`${name}.latency_ms`, ms)
    void metrics.slo(name, true)
    void metrics.incr(`${name}.ok`)

    if (opts.logSuccess) {
      logger.debug(`[${name}] OK`, { ms, ...opts.ctx })
    }

    return result
  } catch (err) {
    const ms = Date.now() - t0

    void metrics.timing(`${name}.latency_ms`, ms)
    void metrics.slo(name, false)
    void metrics.incr(`${name}.error`)

    logger.error(`[${name}] ERREUR`, {
      ms,
      err: err instanceof Error ? err.message : String(err),
      errType: err?.constructor?.name,
      ...opts.ctx,
    })

    throw err
  }
}

/**
 * Version pour les routes API Next.js.
 * Mesure aussi le code de statut HTTP.
 */
export async function instrumentRoute(
  name: string,
  fn: () => Promise<Response>,
  opts: InstrumentOptions = {},
): Promise<Response> {
  const t0 = Date.now()
  let status = 500
  try {
    const resp = await fn()
    status = resp.status
    const ms = Date.now() - t0
    const ok = status < 400

    void metrics.timing(`${name}.latency_ms`, ms)
    void metrics.slo(name, ok)
    void metrics.incr(ok ? `${name}.ok` : `${name}.error`)

    if (!ok) {
      logger.warn(`[route:${name}] ${status}`, { ms, status, ...opts.ctx })
    } else if (opts.logSuccess) {
      logger.debug(`[route:${name}] ${status}`, { ms, status, ...opts.ctx })
    }

    return resp
  } catch (err) {
    const ms = Date.now() - t0
    void metrics.timing(`${name}.latency_ms`, ms)
    void metrics.slo(name, false)
    void metrics.incr(`${name}.error`)

    logger.error(`[route:${name}] CRASH`, {
      ms,
      status,
      err: err instanceof Error ? err.message : String(err),
      ...opts.ctx,
    })

    throw err
  }
}
