/**
 * Moteur d'injection de pannes du Virtual World Hotel Supplier — même
 * principe que lib/vols/virtual-supplier/scenarios.ts : contrôlable
 * UNIQUEMENT côté serveur/test (`VIRTUAL_WORLD_HOTELS_SCENARIO` env, ou
 * `setScenario()` pour un test donné), jamais influençable par le
 * navigateur.
 *
 * Même sous-ensemble que Vols (4 scénarios de panne) : suffisant pour
 * prouver que l'architecture (revalidation prix, sold-out, rejet
 * fournisseur, timeout) est réelle.
 */

export type WorldHotelSimulationScenario =
  | "NORMAL"
  | "SOLD_OUT"
  | "PRICE_CHANGED"
  | "BOOKING_REJECTED"
  | "TIMEOUT"

const KNOWN_SCENARIOS: readonly WorldHotelSimulationScenario[] = [
  "NORMAL",
  "SOLD_OUT",
  "PRICE_CHANGED",
  "BOOKING_REJECTED",
  "TIMEOUT",
]

function normalize(raw: string | undefined | null): WorldHotelSimulationScenario {
  if (!raw) return "NORMAL"
  const upper = raw.toUpperCase()
  return (KNOWN_SCENARIOS as readonly string[]).includes(upper)
    ? (upper as WorldHotelSimulationScenario)
    : "NORMAL"
}

let overrideScenario: WorldHotelSimulationScenario | null = null

/** Scénario actif : override en mémoire (tests) sinon `VIRTUAL_WORLD_HOTELS_SCENARIO` (env, valeur au démarrage). */
export function getScenario(): WorldHotelSimulationScenario {
  if (overrideScenario) return overrideScenario
  return normalize(process.env.VIRTUAL_WORLD_HOTELS_SCENARIO)
}

export function setScenario(scenario: WorldHotelSimulationScenario): void {
  overrideScenario = scenario
}

export function resetScenario(): void {
  overrideScenario = null
}

/** Délai (ms) simulant un fournisseur lent/qui timeout. */
export const SIMULATED_TIMEOUT_DELAY_MS = 3000
