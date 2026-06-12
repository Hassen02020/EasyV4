/**
 * Logger structuré — Easy2Book
 *
 * Sortie JSON en production (compatible Datadog / Loki / Vercel Log Drains).
 * Sortie pretty en développement.
 *
 * Niveaux : debug < info < warn < error
 * Contrôlé par LOG_LEVEL (env var). Défaut : "info" en prod, "debug" en dev.
 *
 * Usage :
 * ```ts
 * import { logger } from "@/lib/logger"
 *
 * logger.info("Débit effectué", { agencyId, amount, movementId })
 * logger.error("Échec Redis", { err: error.message, key })
 * ```
 */

type LogLevel = "debug" | "info" | "warn" | "error"

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const IS_PROD = process.env.NODE_ENV === "production"
const MIN_LEVEL: LogLevel =
  (process.env.LOG_LEVEL as LogLevel | undefined) ??
  (IS_PROD ? "info" : "debug")

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= LEVELS[MIN_LEVEL]
}

function formatJson(
  level: LogLevel,
  msg: string,
  ctx?: Record<string, unknown>,
): string {
  return JSON.stringify({
    t: new Date().toISOString(),
    l: level,
    msg,
    ...ctx,
  })
}

function formatPretty(
  level: LogLevel,
  msg: string,
  ctx?: Record<string, unknown>,
): string {
  const prefix = {
    debug: "\x1b[90m[DBG]\x1b[0m",
    info: "\x1b[36m[INF]\x1b[0m",
    warn: "\x1b[33m[WRN]\x1b[0m",
    error: "\x1b[31m[ERR]\x1b[0m",
  }[level]
  const ctxStr = ctx ? " " + JSON.stringify(ctx) : ""
  return `${prefix} ${msg}${ctxStr}`
}

function log(
  level: LogLevel,
  msg: string,
  ctx?: Record<string, unknown>,
): void {
  if (!shouldLog(level)) return
  const line = IS_PROD ? formatJson(level, msg, ctx) : formatPretty(level, msg, ctx)
  if (level === "error") {
    console.error(line)
  } else if (level === "warn") {
    console.warn(line)
  } else {
    console.log(line)
  }
}

/**
 * trackLatency — mesure le temps d'exécution d'une opération.
 *
 * Usage :
 * ```ts
 * const timer = trackLatency("mygo", "HotelSearch")
 * const result = await client.searchHotels(input)
 * timer.end()  // logue automatiquement la duration
 * ```
 *
 * Ou en mode wrap :
 * ```ts
 * const result = await trackLatency("mygo", "HotelSearch").wrap(() => client.searchHotels(input))
 * ```
 */
export function trackLatency(module: string, label: string) {
  const start = Date.now()
  return {
    /** Logue le résultat et retourne la durée en ms. */
    end(ctx?: Record<string, unknown>): number {
      const ms = Date.now() - start
      log("info", `[${module}] ${label}`, { module, label, ms, ...ctx })
      return ms
    },
    /** Enveloppe une fn async : logue succès ou erreur avec duration. */
    async wrap<T>(fn: () => Promise<T>, ctx?: Record<string, unknown>): Promise<T> {
      try {
        const result = await fn()
        const ms = Date.now() - start
        log("info", `[${module}] ${label} OK`, { module, label, ms, ...ctx })
        return result
      } catch (err) {
        const ms = Date.now() - start
        log("error", `[${module}] ${label} ERREUR`, {
          module,
          label,
          ms,
          err: err instanceof Error ? err.message : String(err),
          errType: err?.constructor?.name,
          ...ctx,
        })
        throw err
      }
    },
  }
}

export const logger = {
  debug: (msg: string, ctx?: Record<string, unknown>) => log("debug", msg, ctx),
  info:  (msg: string, ctx?: Record<string, unknown>) => log("info",  msg, ctx),
  warn:  (msg: string, ctx?: Record<string, unknown>) => log("warn",  msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => log("error", msg, ctx),

  /** Crée un logger enfant avec contexte persistant (ex: module, agencyId). */
  child(defaults: Record<string, unknown>) {
    return {
      debug: (msg: string, ctx?: Record<string, unknown>) =>
        log("debug", msg, { ...defaults, ...ctx }),
      info:  (msg: string, ctx?: Record<string, unknown>) =>
        log("info",  msg, { ...defaults, ...ctx }),
      warn:  (msg: string, ctx?: Record<string, unknown>) =>
        log("warn",  msg, { ...defaults, ...ctx }),
      error: (msg: string, ctx?: Record<string, unknown>) =>
        log("error", msg, { ...defaults, ...ctx }),
    }
  },
}
