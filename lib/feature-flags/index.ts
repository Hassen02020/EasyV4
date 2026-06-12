/**
 * Feature Flags — Easy2Book
 *
 * Système de flags par module de réservation.
 * Priorité de résolution (ordre décroissant) :
 *  1. Variable d'environnement  FEATURE_<FLAG>="true"|"false"
 *  2. Redis Upstash              clé "e2b:ff:<flag>"
 *  3. Valeur statique par défaut (constante ci-dessous)
 *
 * Usage côté serveur :
 *   const flags = await getFeatureFlags()
 *   if (flags.vols) { ... }
 *
 * Usage côté client (Server Component → Client Component) :
 *   Passer `flags` en prop depuis le Server Component.
 */

import { getRedis } from "@/lib/cache/redis"

// ---------------------------------------------------------------------------
// Déclaration des flags
// ---------------------------------------------------------------------------

export type FeatureFlag =
  | "hotels_tunisie"   // Hôtels Tunisie via myGo (opérationnel)
  | "hotels_monde"     // Hôtels Monde (stub — à câbler Expedia/Booking)
  | "vols"             // Module Vols (stub — à câbler Amadeus/Sabre)
  | "omra"             // Module Omraty
  | "packages"         // Voyages Organisés
  | "transferts"       // Transferts aéroport
  | "car"              // Location de voiture
  | "yield_engine"     // Moteur de marge activé pour les partenaires B2B
  | "inventory_locks"  // Verrouillage panier (Redis TTL 10 min)
  | "wallet_b2b"       // Portail wallet B2B (déjà opérationnel)

export type FeatureFlags = Record<FeatureFlag, boolean>

// ---------------------------------------------------------------------------
// Valeurs par défaut statiques
// ---------------------------------------------------------------------------

const DEFAULTS: FeatureFlags = {
  hotels_tunisie: true,
  hotels_monde: false,
  vols: false,
  omra: true,
  packages: true,
  transferts: true,
  car: false,
  yield_engine: true,
  inventory_locks: true,
  wallet_b2b: true,
}

// Mapping flag → nom de variable d'environnement
const ENV_KEYS: Record<FeatureFlag, string> = {
  hotels_tunisie: "FEATURE_HOTELS_TUNISIE",
  hotels_monde: "FEATURE_HOTELS_MONDE",
  vols: "FEATURE_VOLS",
  omra: "FEATURE_OMRA",
  packages: "FEATURE_PACKAGES",
  transferts: "FEATURE_TRANSFERTS",
  car: "FEATURE_CAR",
  yield_engine: "FEATURE_YIELD_ENGINE",
  inventory_locks: "FEATURE_INVENTORY_LOCKS",
  wallet_b2b: "FEATURE_WALLET_B2B",
}

// ---------------------------------------------------------------------------
// Résolution d'un flag unique
// ---------------------------------------------------------------------------

function fromEnv(flag: FeatureFlag): boolean | null {
  const val = process.env[ENV_KEYS[flag]]
  if (val === "true" || val === "1") return true
  if (val === "false" || val === "0") return false
  return null
}

async function fromRedis(flag: FeatureFlag): Promise<boolean | null> {
  try {
    const redis = getRedis()
    if (!redis) return null
    const val = await redis.get<string>(`e2b:ff:${flag}`)
    if (val === "true" || val === "1") return true
    if (val === "false" || val === "0") return false
    return null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// API publique
// ---------------------------------------------------------------------------

/**
 * Résout tous les feature flags.
 * En prod avec Redis : appel unique via pipeline.
 * En dev sans Redis : résolution env + défauts uniquement.
 */
export async function getFeatureFlags(): Promise<FeatureFlags> {
  const flags = { ...DEFAULTS }
  const allFlags = Object.keys(DEFAULTS) as FeatureFlag[]

  // 1. Env vars (synchrone, priorité maximale)
  for (const flag of allFlags) {
    const envVal = fromEnv(flag)
    if (envVal !== null) flags[flag] = envVal
  }

  // 2. Redis (pour les flags non écrasés par env)
  const needsRedis = allFlags.filter((f) => fromEnv(f) === null)
  if (needsRedis.length > 0) {
    try {
      const redis = getRedis()
      if (redis) {
        const keys = needsRedis.map((f) => `e2b:ff:${f}`)
        const values = await redis.mget<string[]>(...keys)
        for (let i = 0; i < needsRedis.length; i++) {
          const val = values[i]
          if (val === "true" || val === "1") flags[needsRedis[i]!] = true
          else if (val === "false" || val === "0")
            flags[needsRedis[i]!] = false
        }
      }
    } catch {
      // Redis indisponible → on garde env + défauts
    }
  }

  return flags
}

/**
 * Résout un seul flag (utile dans les layouts/pages individuelles).
 */
export async function isEnabled(flag: FeatureFlag): Promise<boolean> {
  const envVal = fromEnv(flag)
  if (envVal !== null) return envVal
  const redisVal = await fromRedis(flag)
  if (redisVal !== null) return redisVal
  return DEFAULTS[flag]
}

/**
 * Override d'un flag en Redis (admin uniquement).
 * TTL optionnel en secondes (défaut : pas d'expiration).
 */
export async function setFlag(
  flag: FeatureFlag,
  value: boolean,
  ttlSeconds?: number,
): Promise<void> {
  const redis = getRedis()
  if (!redis) throw new Error("Redis non disponible — impossible de persister le flag")
  const opts = ttlSeconds ? { ex: ttlSeconds } : undefined
  await redis.set(`e2b:ff:${flag}`, String(value), opts)
}

/**
 * Réinitialise un flag (supprime la clé Redis — retombe sur env/défaut).
 */
export async function resetFlag(flag: FeatureFlag): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  await redis.del(`e2b:ff:${flag}`)
}
