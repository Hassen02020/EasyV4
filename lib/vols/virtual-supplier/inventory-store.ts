/**
 * Inventaire mutable du Virtual Flight Supplier — en mémoire (process-local),
 * même principe que lib/mygo/virtual-supplier/inventory-store.ts (harness de
 * test réaliste, pas une base de données fournisseur réelle).
 *
 * Disponibilité de BASE dérivée d'un hash déterministe (reproductible d'un
 * run à l'autre pour un même vol/date), sur laquelle viennent s'appliquer
 * les réservations/annulations réelles effectuées pendant le test —
 * distribution volontairement réaliste : ~15% SOLD_OUT, ~25% LIMITED.
 *
 * Concurrence : `reserve()` sérialise les accès à une même clé via une
 * chaîne de promesses (Node mono-thread, mais pas les points d'`await`) —
 * sous accès concurrents sur le MÊME vol, un seul appelant peut faire
 * passer la disponibilité sous zéro.
 */

import { hashSeed, mulberry32Like } from "./rng"

const BASE_MIN = 2
const BASE_MAX = 9

function baseAvailability(offerKey: string): number {
  const seed = hashSeed(offerKey)
  const rng = mulberry32Like(seed)
  const roll = rng()
  if (roll < 0.15) return 0
  if (roll < 0.4) return 1 + Math.floor(rng() * 2) // 1..2
  return BASE_MIN + Math.floor(rng() * (BASE_MAX - BASE_MIN)) // 2..8
}

/** Delta cumulé (négatif = réservé, positif = annulé/restitué) par clé d'offre. */
const deltas = new Map<string, number>()
/** Chaîne de verrous par clé — sérialise les accès concurrents à la même offre. */
const locks = new Map<string, Promise<unknown>>()

export function currentAvailability(offerKey: string): number {
  const base = baseAvailability(offerKey)
  const delta = deltas.get(offerKey) ?? 0
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

/** Réserve `quantity` sièges sur l'offre, atomiquement. */
export async function reserve(offerKey: string, quantity: number): Promise<boolean> {
  return withLock(offerKey, () => {
    const avail = currentAvailability(offerKey)
    if (avail < quantity) return false
    deltas.set(offerKey, (deltas.get(offerKey) ?? 0) - quantity)
    return true
  })
}

/** Restitue l'inventaire (annulation) — symétrique de `reserve`. */
export async function release(offerKey: string, quantity: number): Promise<void> {
  await withLock(offerKey, () => {
    deltas.set(offerKey, (deltas.get(offerKey) ?? 0) + quantity)
  })
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
