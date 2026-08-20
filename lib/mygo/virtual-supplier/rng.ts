/**
 * PRNG déterministe (mulberry32) + hash de seed — partagés entre le
 * générateur de catalogue et le store d'inventaire pour que tout le
 * Virtual MyGo Supplier soit reproductible d'un run à l'autre.
 */

export function mulberry32Like(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Hash simple string -> uint32, pour dériver un seed stable depuis une clé texte. */
export function hashSeed(key: string): number {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
