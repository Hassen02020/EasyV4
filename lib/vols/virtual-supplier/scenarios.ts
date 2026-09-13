/**
 * Moteur d'injection de pannes du Virtual Flight Supplier — même principe
 * que lib/mygo/virtual-supplier/scenarios.ts : contrôlable UNIQUEMENT
 * côté serveur/test (`VIRTUAL_FLIGHTS_SCENARIO` env, ou `setScenario()`
 * pour un test donné), jamais influençable par le navigateur.
 *
 * Sous-ensemble volontairement plus restreint que myGo (4 scénarios de
 * panne au lieu de 14) : suffisant pour prouver que l'architecture
 * (revalidation prix, sold-out, rejet fournisseur, timeout) est réelle,
 * sans reconstruire l'exhaustivité de myGo pour un fournisseur qui n'a
 * jamais eu de scénarios testés avant ce cycle.
 */

export type FlightSimulationScenario =
  | "NORMAL"
  | "SOLD_OUT"
  | "PRICE_CHANGED"
  | "BOOKING_REJECTED"
  | "TIMEOUT"

const KNOWN_SCENARIOS: readonly FlightSimulationScenario[] = [
  "NORMAL",
  "SOLD_OUT",
  "PRICE_CHANGED",
  "BOOKING_REJECTED",
  "TIMEOUT",
]

function normalize(raw: string | undefined | null): FlightSimulationScenario {
  if (!raw) return "NORMAL"
  const upper = raw.toUpperCase()
  return (KNOWN_SCENARIOS as readonly string[]).includes(upper)
    ? (upper as FlightSimulationScenario)
    : "NORMAL"
}

let overrideScenario: FlightSimulationScenario | null = null

/** Scénario actif : override en mémoire (tests) sinon `VIRTUAL_FLIGHTS_SCENARIO` (env, valeur au démarrage). */
export function getScenario(): FlightSimulationScenario {
  if (overrideScenario) return overrideScenario
  return normalize(process.env.VIRTUAL_FLIGHTS_SCENARIO)
}

export function setScenario(scenario: FlightSimulationScenario): void {
  overrideScenario = scenario
}

export function resetScenario(): void {
  overrideScenario = null
}

/** Délai (ms) simulant un fournisseur lent/qui timeout. */
export const SIMULATED_TIMEOUT_DELAY_MS = 3000
