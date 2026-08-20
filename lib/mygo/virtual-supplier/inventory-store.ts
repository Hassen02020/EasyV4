/**
 * Inventaire mutable du Virtual MyGo Supplier — en mémoire (process-local),
 * volontairement : c'est un harness de test, pas une base de données
 * fournisseur. `resetInventory()` réinitialise entre suites de tests.
 *
 * Disponibilité par date (item 12) : chaque (hôtel, chambre, nuit) a une
 * disponibilité de BASE dérivée d'un hash déterministe (reproductible),
 * sur laquelle viennent s'appliquer les réservations/annulations réelles
 * effectuées pendant le test.
 *
 * Concurrence (item 25) : `reserve()` sérialise les accès à une même clé
 * via une chaîne de promesses — sans ça, un `await` entre "vérifier" et
 * "décrémenter" laisserait deux requêtes concurrentes réserver la même
 * dernière chambre (Node est mono-thread, mais pas les points d'`await`).
 */

import { hashSeed, mulberry32Like } from "./rng"

const BASE_MIN = 0
const BASE_MAX = 6

function baseAvailability(hotelId: number, roomId: number, dateIso: string): number {
  const seed = hashSeed(`${hotelId}:${roomId}:${dateIso}`)
  const rng = mulberry32Like(seed)
  // Distribution volontairement réaliste : ~15% SOLD_OUT, ~25% LIMITED (1-2), le reste 3-6.
  const roll = rng()
  if (roll < 0.15) return 0
  if (roll < 0.4) return 1 + Math.floor(rng() * 2) // 1..2
  return BASE_MIN + 3 + Math.floor(rng() * (BASE_MAX - 2)) // 3..6
}

/** Delta cumulé (négatif = réservé, positif = annulé/restitué) par (hotelId,roomId,date). */
const deltas = new Map<string, number>()
/** Chaîne de verrous par clé — sérialise les accès concurrents à la même chambre/date. */
const locks = new Map<string, Promise<unknown>>()

function key(hotelId: number, roomId: number, dateIso: string): string {
  return `${hotelId}:${roomId}:${dateIso}`
}

/** Liste des nuits [checkIn, checkOut) au format YYYY-MM-DD. */
export function nightsBetween(checkIn: string, checkOut: string): string[] {
  const nights: string[] = []
  const d = new Date(checkIn + "T00:00:00Z")
  const end = new Date(checkOut + "T00:00:00Z")
  while (d < end) {
    nights.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return nights
}

export function currentAvailability(hotelId: number, roomId: number, dateIso: string): number {
  const k = key(hotelId, roomId, dateIso)
  const base = baseAvailability(hotelId, roomId, dateIso)
  const delta = deltas.get(k) ?? 0
  return Math.max(0, base + delta)
}

async function withLock<T>(k: string, fn: () => T | Promise<T>): Promise<T> {
  const prior = locks.get(k) ?? Promise.resolve()
  let release: () => void
  const gate = new Promise<void>((r) => (release = r))
  locks.set(
    k,
    prior.then(() => gate),
  )
  await prior
  try {
    return await fn()
  } finally {
    release!()
  }
}

export interface ReserveResult {
  ok: boolean
  /** Nuit(s) où la disponibilité manquait, si `ok === false`. */
  unavailableNights?: string[]
}

/**
 * Réserve `quantity` chambres pour chaque nuit du séjour, de façon
 * atomique par nuit (verrou par clé hotel:room:date). Sous accès
 * concurrents sur la MÊME clé, un seul appelant peut faire passer la
 * disponibilité sous zéro — l'autre reçoit `ok:false`.
 */
export async function reserve(
  hotelId: number,
  roomId: number,
  checkIn: string,
  checkOut: string,
  quantity = 1,
): Promise<ReserveResult> {
  const nights = nightsBetween(checkIn, checkOut)
  const unavailable: string[] = []
  // Verrouille nuit par nuit, dans l'ordre — évite tout chevauchement partiel.
  for (const night of nights) {
    const k = key(hotelId, roomId, night)
    const committed = await withLock(k, () => {
      const avail = currentAvailability(hotelId, roomId, night)
      if (avail < quantity) return false
      deltas.set(k, (deltas.get(k) ?? 0) - quantity)
      return true
    })
    if (!committed) unavailable.push(night)
  }
  if (unavailable.length > 0) {
    // Rollback des nuits déjà décrémentées dans cette tentative avant d'échouer.
    const succeeded = nights.filter((n) => !unavailable.includes(n))
    for (const night of succeeded) {
      const k = key(hotelId, roomId, night)
      await withLock(k, () => {
        deltas.set(k, (deltas.get(k) ?? 0) + quantity)
      })
    }
    return { ok: false, unavailableNights: unavailable }
  }
  return { ok: true }
}

/** Restitue l'inventaire (annulation) — symétrique de `reserve`. */
export async function release(
  hotelId: number,
  roomId: number,
  checkIn: string,
  checkOut: string,
  quantity = 1,
): Promise<void> {
  const nights = nightsBetween(checkIn, checkOut)
  for (const night of nights) {
    const k = key(hotelId, roomId, night)
    await withLock(k, () => {
      deltas.set(k, (deltas.get(k) ?? 0) + quantity)
    })
  }
}

export type AvailabilityLevel = "AVAILABLE" | "LIMITED" | "SOLD_OUT"

export function availabilityLevel(count: number): AvailabilityLevel {
  if (count <= 0) return "SOLD_OUT"
  if (count <= 2) return "LIMITED"
  return "AVAILABLE"
}

/** Réinitialise tout l'inventaire mutable — utile entre suites de tests. */
export function resetInventory() {
  deltas.clear()
  locks.clear()
}
