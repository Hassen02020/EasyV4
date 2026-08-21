/**
 * Erreurs typées du client myGo.
 *
 * Toutes les erreurs héritent de MyGoError → permet au consommateur de faire
 * `if (err instanceof MyGoError)` sans avoir à connaître les sous-classes.
 */

export class MyGoError extends Error {
  /** Code interne pour logs / monitoring. */
  readonly kind: string
  /** Code HTTP ou code applicatif (ErrorMessage.Code) si dispo. */
  readonly code?: number

  constructor(kind: string, message: string, code?: number) {
    super(message)
    this.name = "MyGoError"
    this.kind = kind
    this.code = code
  }
}

/** Erreur réseau (DNS, connexion refusée, abort, …). */
export class MyGoNetworkError extends MyGoError {
  constructor(message: string, public readonly cause?: unknown) {
    super("network", message)
    this.name = "MyGoNetworkError"
  }
}

/** Timeout dépassé (15s par défaut). */
export class MyGoTimeoutError extends MyGoError {
  constructor(timeoutMs: number) {
    super("timeout", `myGo API timeout after ${timeoutMs}ms`)
    this.name = "MyGoTimeoutError"
  }
}

/** Auth échouée (mauvais login/password) — code 400 + Description "Check the sending of the login". */
export class MyGoAuthError extends MyGoError {
  constructor(message: string) {
    super("auth", message, 401)
    this.name = "MyGoAuthError"
  }
}

/** Réponse non parsable (ne respecte pas le schéma Zod). */
export class MyGoSchemaError extends MyGoError {
  constructor(method: string, public readonly issues: unknown) {
    super("schema", `myGo ${method} response failed schema validation`)
    this.name = "MyGoSchemaError"
  }
}

/** Erreur applicative renvoyée par myGo (ErrorMessage.Code != 0/null). */
export class MyGoApiError extends MyGoError {
  constructor(method: string, code: number, public readonly description: string) {
    super("api", `myGo ${method}: [${code}] ${description}`, code)
    this.name = "MyGoApiError"
  }
}

/** Le circuit breaker est ouvert — fail-fast pour ne pas surcharger l'API en panne. */
export class MyGoCircuitOpenError extends MyGoError {
  constructor(reopensAt: Date) {
    super(
      "circuit_open",
      `myGo circuit breaker is OPEN, will retry at ${reopensAt.toISOString()}`,
    )
    this.name = "MyGoCircuitOpenError"
  }
}
