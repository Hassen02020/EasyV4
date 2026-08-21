/**
 * Circuit breaker minimaliste pour protéger l'API myGo en panne.
 *
 * États:
 *   - CLOSED: tout passe (état normal)
 *   - OPEN: on rejette tout sans appeler l'API (pendant `coolDownMs`)
 *   - HALF_OPEN: on laisse passer 1 requête de test après le cool-down
 *
 * Compte les échecs sur une fenêtre glissante de `windowMs`.
 * Si `failureThreshold` atteint dans la fenêtre → on ouvre.
 */

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN"

export interface CircuitOptions {
  failureThreshold: number
  windowMs: number
  coolDownMs: number
}

export class CircuitBreaker {
  private state: CircuitState = "CLOSED"
  private failures: number[] = []
  private openedAt: number | null = null

  constructor(private readonly opts: CircuitOptions) {}

  getState(): CircuitState {
    this.refresh()
    return this.state
  }

  /** Date à laquelle le breaker tentera HALF_OPEN. Null si CLOSED. */
  getReopensAt(): Date | null {
    if (this.state !== "OPEN" || this.openedAt === null) return null
    return new Date(this.openedAt + this.opts.coolDownMs)
  }

  /** Appelé avant chaque appel API. Throw si OPEN. */
  beforeCall(): void {
    this.refresh()
    // CLOSED ou HALF_OPEN → on laisse passer
  }

  /** Appelé après un succès. */
  onSuccess(): void {
    this.failures = []
    this.state = "CLOSED"
    this.openedAt = null
  }

  /** Appelé après un échec (réseau/timeout/5xx — pas erreurs métier). */
  onFailure(): void {
    const now = Date.now()
    this.failures.push(now)
    this.failures = this.failures.filter((t) => now - t < this.opts.windowMs)
    if (this.state === "HALF_OPEN") {
      this.openCircuit()
      return
    }
    if (this.failures.length >= this.opts.failureThreshold) {
      this.openCircuit()
    }
  }

  isOpen(): boolean {
    this.refresh()
    return this.state === "OPEN"
  }

  private openCircuit() {
    this.state = "OPEN"
    this.openedAt = Date.now()
  }

  private refresh() {
    if (
      this.state === "OPEN" &&
      this.openedAt !== null &&
      Date.now() - this.openedAt >= this.opts.coolDownMs
    ) {
      this.state = "HALF_OPEN"
      this.openedAt = null
    }
  }
}

/** Singleton partagé par toutes les instances client (un seul breaker par process). */
let shared: CircuitBreaker | null = null
export function getSharedCircuitBreaker(): CircuitBreaker {
  if (!shared) {
    shared = new CircuitBreaker({
      failureThreshold: 5,
      windowMs: 60_000,
      coolDownMs: 120_000,
    })
  }
  return shared
}

/** Reset — uniquement utile en tests. */
export function resetSharedCircuitBreaker() {
  shared = null
}
