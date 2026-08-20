/**
 * Moteur d'injection de pannes du Virtual MyGo Supplier (item 34).
 *
 * Contrôlable UNIQUEMENT côté serveur/test :
 *  - `MYGO_SIMULATION_SCENARIO` (env, valeur par défaut au démarrage du process) ;
 *  - `setScenario()` / `resetScenario()` (état en mémoire, pour changer de
 *    scénario entre deux cas de test sans redémarrer le process — exposé
 *    uniquement via la route de contrôle virtual-mygo/control, elle-même
 *    gardée par MYGO_MODE==="virtual").
 *
 * Le frontend/navigateur n'a jamais un moyen d'influencer le scénario actif.
 */

export type SimulationScenario =
  | "NORMAL"
  | "NO_AVAILABILITY"
  | "PRICE_CHANGED"
  | "INVALID_TOKEN"
  | "ROOM_CHANGED"
  | "HOTEL_ID_MISMATCH"
  | "TIMEOUT"
  | "TIMEOUT_AFTER_ACCEPT"
  | "TWO_PLAUSIBLE_CANDIDATES"
  | "BOOKING_REJECTED"
  | "CURRENCY_MISMATCH"
  | "MALFORMED_RESPONSE"
  | "NETWORK_ERROR"
  | "CANCEL_FAILED"

const KNOWN_SCENARIOS: readonly SimulationScenario[] = [
  "NORMAL",
  "NO_AVAILABILITY",
  "PRICE_CHANGED",
  "INVALID_TOKEN",
  "ROOM_CHANGED",
  "HOTEL_ID_MISMATCH",
  "TIMEOUT",
  "TIMEOUT_AFTER_ACCEPT",
  "TWO_PLAUSIBLE_CANDIDATES",
  "BOOKING_REJECTED",
  "CURRENCY_MISMATCH",
  "MALFORMED_RESPONSE",
  "NETWORK_ERROR",
  "CANCEL_FAILED",
]

/** "MALFORMED_XML" accepté comme alias — vocabulaire du cahier des charges, même comportement que MALFORMED_RESPONSE (le contrat réel myGo est JSON, voir lib/mygo/config.ts). */
function normalize(raw: string | undefined | null): SimulationScenario {
  if (!raw) return "NORMAL"
  const upper = raw.toUpperCase()
  if (upper === "MALFORMED_XML") return "MALFORMED_RESPONSE"
  return (KNOWN_SCENARIOS as readonly string[]).includes(upper)
    ? (upper as SimulationScenario)
    : "NORMAL"
}

let current: SimulationScenario = normalize(process.env.MYGO_SIMULATION_SCENARIO)

export function getScenario(): SimulationScenario {
  return current
}

export function setScenario(raw: string): SimulationScenario {
  current = normalize(raw)
  return current
}

export function resetScenario() {
  current = normalize(process.env.MYGO_SIMULATION_SCENARIO)
}

/** Délai (ms) simulant un fournisseur lent/qui timeout — le client doit avoir un MYGO_TIMEOUT_MS plus bas pour observer un vrai timeout rapidement en test. */
export const SIMULATED_TIMEOUT_DELAY_MS = 3000
