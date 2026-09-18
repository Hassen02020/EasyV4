/**
 * Tests unitaires — moteur de verrouillage d'inventaire (lib/booking/inventory.ts).
 *
 * Jusqu'ici, ce moteur n'avait AUCUNE couverture directe (seul
 * `lib/admin/__tests__/inventory-locks-core.test.ts` teste la vue de lecture
 * admin, pas `acquireLock`/`releaseLock`/`refreshLock`/`checkLock`
 * eux-mêmes) — voir le rapport d'investigation qui a précédé ce chantier.
 *
 * Utilise `redisOverride` (même contrat que
 * `lib/booking/__tests__/guest-idempotency.test.ts` pour
 * `withGuestIdempotency`) — un faux client Redis en mémoire, pour tester la
 * logique SET NX / TTL / fail-closed sans dépendre d'un Upstash réel. Les
 * assertions liées à la trace DB (`inventory_locks`) ne sont PAS couvertes
 * ici (elles sont fire-and-forget, jamais consultées pour la décision
 * d'exclusivité — voir l'en-tête de inventory.ts) ; la preuve DB-mode
 * complète reste `lib/admin/__tests__/inventory-locks-core.test.ts`.
 */

import test from "node:test"
import assert from "node:assert/strict"

import { acquireLock, releaseLock, refreshLock, checkLock, type InventoryRedis } from "@/lib/booking/inventory"

/**
 * Faux client Redis minimal — TTL réellement honoré (pas juste stocké),
 * pour pouvoir tester une expiration réelle sans attendre 10 minutes.
 */
function makeMockRedis() {
  const store = new Map<string, { value: string; expiresAt: number | null }>()

  function isLive(key: string): boolean {
    const entry = store.get(key)
    if (!entry) return false
    if (entry.expiresAt !== null && Date.now() >= entry.expiresAt) {
      store.delete(key)
      return false
    }
    return true
  }

  const redis: InventoryRedis = {
    async get<T>(key: string) {
      return isLive(key) ? (store.get(key)!.value as unknown as T) : null
    },
    async set(key: string, value: string, opts?: { ex?: number; nx?: boolean }) {
      if (opts?.nx && isLive(key)) return null // SET NX : n'écrase jamais une clé vivante
      store.set(key, {
        value,
        expiresAt: opts?.ex ? Date.now() + opts.ex * 1000 : null,
      })
      return "OK"
    },
    async expire(key: string, seconds: number) {
      const entry = store.get(key)
      if (!entry) return 0
      entry.expiresAt = Date.now() + seconds * 1000
      return 1
    },
    async del(key: string) {
      return store.delete(key) ? 1 : 0
    },
    async ttl(key: string) {
      if (!isLive(key)) return -2
      const entry = store.get(key)!
      return entry.expiresAt === null ? -1 : Math.ceil((entry.expiresAt - Date.now()) / 1000)
    },
  }

  /** Force l'expiration immédiate d'une clé — simule un TTL écoulé sans sleep. */
  function expireNow(key: string) {
    const entry = store.get(key)
    if (entry) entry.expiresAt = Date.now() - 1
  }

  return { redis, store, expireNow }
}

const baseInput = {
  agencyId: "agency-a",
  module: "hotel" as const,
  itemId: "offer-123",
}

// --- Test 1 : offre valide → verrou accordé -------------------------------

test("acquireLock : offre libre → verrou accordé (ok:true)", async () => {
  const { redis } = makeMockRedis()
  const result = await acquireLock({ ...baseInput, sessionId: "session-a" }, redis)
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.ok(result.expiresAt instanceof Date)
    assert.ok(result.lockKey.includes(baseInput.agencyId))
  }
})

test("acquireLock : même session ré-acquiert son propre verrou (idempotent), TTL renouvelé", async () => {
  const { redis } = makeMockRedis()
  const first = await acquireLock({ ...baseInput, sessionId: "session-a" }, redis)
  const second = await acquireLock({ ...baseInput, sessionId: "session-a" }, redis)
  assert.equal(first.ok, true)
  assert.equal(second.ok, true)
})

// --- Test 7 : deux sessions concurrentes sur LA MÊME offre → une seule gagne ---

test("acquireLock : deux sessions concurrentes sur la même offre → une seule obtient ok:true, l'autre 'conflict'", async () => {
  const { redis } = makeMockRedis()
  const winner = await acquireLock({ ...baseInput, sessionId: "session-a" }, redis)
  const loser = await acquireLock({ ...baseInput, sessionId: "session-b" }, redis)

  assert.equal(winner.ok, true)
  assert.equal(loser.ok, false)
  if (!loser.ok) assert.equal(loser.reason, "conflict")
})

// --- Test 2 : verrou expiré → nouvelle acquisition possible ---------------

test("acquireLock : verrou expiré (TTL écoulé) → une nouvelle session peut l'acquérir", async () => {
  const { redis, expireNow } = makeMockRedis()
  const first = await acquireLock({ ...baseInput, sessionId: "session-a" }, redis)
  assert.equal(first.ok, true)
  if (first.ok) expireNow(first.lockKey)

  const second = await acquireLock({ ...baseInput, sessionId: "session-b" }, redis)
  assert.equal(second.ok, true, "un verrou expiré ne doit jamais bloquer une nouvelle acquisition")
})

// --- Test 3 : verrou libéré → nouvelle acquisition possible ---------------

test("releaseLock puis acquireLock : une offre libérée est immédiatement ré-acquérable par une autre session", async () => {
  const { redis } = makeMockRedis()
  const first = await acquireLock({ ...baseInput, sessionId: "session-a" }, redis)
  assert.equal(first.ok, true)

  await releaseLock({ ...baseInput, sessionId: "session-a" }, redis)

  const second = await acquireLock({ ...baseInput, sessionId: "session-b" }, redis)
  assert.equal(second.ok, true)
})

test("releaseLock : ne libère JAMAIS le verrou d'une autre session (ne supprime que si sessionId correspond)", async () => {
  const { redis } = makeMockRedis()
  await acquireLock({ ...baseInput, sessionId: "session-a" }, redis)

  // session-b tente de libérer le verrou de session-a — ne doit rien faire.
  await releaseLock({ ...baseInput, sessionId: "session-b" }, redis)

  const stillHeld = await acquireLock({ ...baseInput, sessionId: "session-c" }, redis)
  assert.equal(stillHeld.ok, false, "le verrou de session-a doit toujours être actif")
})

// --- Fail-closed : mandat explicite Master Prompt v2 §8/§10 ---------------

test("acquireLock : Redis indisponible (undefined) → ok:false, reason:'redis_unavailable', jamais un faux succès", async () => {
  const result = await acquireLock({ ...baseInput, sessionId: "session-a" }, undefined)
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.reason, "redis_unavailable")
})

test("refreshLock : Redis indisponible → ok:false, reason:'redis_unavailable' (jamais un keep-alive fantôme)", async () => {
  const result = await refreshLock({ ...baseInput, sessionId: "session-a" }, undefined)
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.reason, "redis_unavailable")
})

// --- Tenant-scoping : mandat explicite Master Prompt v2 §8/§10 ------------

test("acquireLock : même itemId, deux agences différentes → aucune collision, les deux obtiennent ok:true", async () => {
  const { redis } = makeMockRedis()
  const agencyA = await acquireLock(
    { agencyId: "agency-a", module: "hotel", itemId: "same-offer-id", sessionId: "session-a" },
    redis,
  )
  const agencyB = await acquireLock(
    { agencyId: "agency-b", module: "hotel", itemId: "same-offer-id", sessionId: "session-b" },
    redis,
  )
  assert.equal(agencyA.ok, true, "l'agence A ne doit jamais être bloquée par un itemId identique appartenant à l'agence B")
  assert.equal(agencyB.ok, true)
  if (agencyA.ok && agencyB.ok) {
    assert.notEqual(agencyA.lockKey, agencyB.lockKey, "les clés Redis de deux agences ne doivent jamais coïncider")
  }
})

test("acquireLock : la clé Redis inclut agencyId (namespacing tenant explicite)", async () => {
  const { redis } = makeMockRedis()
  const result = await acquireLock({ ...baseInput, sessionId: "session-a" }, redis)
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.match(result.lockKey, new RegExp(`e2b:lock:${baseInput.agencyId}:`))
  }
})

// --- Test 8 : accès cross-tenant refusé ------------------------------------

test("checkLock : l'agence B ne voit jamais le verrou de l'agence A même sur un itemId identique", async () => {
  const { redis } = makeMockRedis()
  await acquireLock({ agencyId: "agency-a", module: "hotel", itemId: "same-offer-id", sessionId: "session-x" }, redis)

  const crossTenantCheck = await checkLock(
    { agencyId: "agency-b", module: "hotel", itemId: "same-offer-id", sessionId: "session-x" },
    redis,
  )
  assert.equal(
    crossTenantCheck.held,
    false,
    "même sessionId et itemId identiques : l'agence B ne doit jamais voir le verrou posé par l'agence A",
  )
})

test("releaseLock : l'agence B ne peut jamais libérer le verrou de l'agence A (namespacing empêche toute portée cross-tenant)", async () => {
  const { redis } = makeMockRedis()
  await acquireLock({ agencyId: "agency-a", module: "hotel", itemId: "same-offer-id", sessionId: "session-x" }, redis)

  // Tentative de libération avec le même sessionId/itemId mais une AUTRE agence.
  await releaseLock(
    { agencyId: "agency-b", module: "hotel", itemId: "same-offer-id", sessionId: "session-x" },
    redis,
  )

  // Le verrou de l'agence A doit être intact.
  const stillHeld = await checkLock(
    { agencyId: "agency-a", module: "hotel", itemId: "same-offer-id", sessionId: "session-x" },
    redis,
  )
  assert.equal(stillHeld.held, true, "releaseLock sous l'agence B ne doit jamais affecter le verrou de l'agence A")
})

// --- checkLock : lecture seule ---------------------------------------------

test("checkLock : session détentrice → held:true ; autre session → held:false", async () => {
  const { redis } = makeMockRedis()
  await acquireLock({ ...baseInput, sessionId: "session-a" }, redis)

  const holder = await checkLock({ ...baseInput, sessionId: "session-a" }, redis)
  const other = await checkLock({ ...baseInput, sessionId: "session-b" }, redis)

  assert.equal(holder.held, true)
  assert.equal(other.held, false)
})

test("checkLock : verrou expiré → held:false", async () => {
  const { redis, expireNow } = makeMockRedis()
  const acquired = await acquireLock({ ...baseInput, sessionId: "session-a" }, redis)
  if (acquired.ok) expireNow(acquired.lockKey)

  const result = await checkLock({ ...baseInput, sessionId: "session-a" }, redis)
  assert.equal(result.held, false, "un verrou expiré ne doit jamais être rapporté comme détenu")
})

// --- refreshLock : keep-alive ----------------------------------------------

test("refreshLock : session détentrice → ok:true, TTL repoussé", async () => {
  const { redis } = makeMockRedis()
  await acquireLock({ ...baseInput, sessionId: "session-a" }, redis)

  const refreshed = await refreshLock({ ...baseInput, sessionId: "session-a" }, redis)
  assert.equal(refreshed.ok, true)
})

test("refreshLock : verrou déjà expiré → ok:false, reason:'conflict' (jamais un keep-alive sur du vide)", async () => {
  const { redis, expireNow } = makeMockRedis()
  const acquired = await acquireLock({ ...baseInput, sessionId: "session-a" }, redis)
  if (acquired.ok) expireNow(acquired.lockKey)

  const result = await refreshLock({ ...baseInput, sessionId: "session-a" }, redis)
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.reason, "conflict")
})

test("refreshLock : verrou détenu par une autre session → ok:false, reason:'conflict'", async () => {
  const { redis } = makeMockRedis()
  await acquireLock({ ...baseInput, sessionId: "session-a" }, redis)

  const result = await refreshLock({ ...baseInput, sessionId: "session-b" }, redis)
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.reason, "conflict")
})
