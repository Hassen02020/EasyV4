/**
 * Tests unitaires — `withGuestIdempotency` (lib/booking/guest-actions.ts).
 *
 * Même contrat que `debitPartnerCredit` (Phase 11,
 * lib/pro/__tests__/booking-actions.test.ts) : un deuxième appel avec la
 * même `idempotencyKey` doit renvoyer le résultat mis en cache sans
 * ré-exécuter `run()` — garde anti double-paiement / double-réservation
 * pour le tunnel guest checkout B2C (double-clic, retry réseau, etc.).
 */

import test from "node:test"
import assert from "node:assert/strict"

import { withGuestIdempotency } from "@/lib/booking/guest-idempotency"

/**
 * Faux client Redis minimal — même contrat que `redisOverride`.
 */
function makeMockRedis() {
  const store = new Map<string, string>()
  return {
    redis: {
      get: async <T>(key: string) => (store.has(key) ? (store.get(key) as T) : null),
      set: async (key: string, value: string) => {
        store.set(key, value)
      },
    },
    store,
  }
}

test("withGuestIdempotency : sans Redis, exécute run() à chaque appel (dégradation gracieuse)", async () => {
  let calls = 0
  const run = async () => {
    calls += 1
    return { ok: true, n: calls }
  }
  const first = await withGuestIdempotency("key-no-redis", run, undefined)
  const second = await withGuestIdempotency("key-no-redis", run, undefined)
  assert.equal(first.n, 1)
  assert.equal(second.n, 2)
  assert.equal(calls, 2)
})

test("withGuestIdempotency : un deuxième appel avec la même clé renvoie le résultat caché sans ré-exécuter run()", async () => {
  const { redis } = makeMockRedis()
  let calls = 0
  const run = async () => {
    calls += 1
    return { ok: true, reservationId: `res-${calls}`, publicRef: "EZB-0001", status: "confirmed" as const }
  }

  const first = await withGuestIdempotency("guest-key-1", run, redis)
  const second = await withGuestIdempotency("guest-key-1", run, redis)

  assert.deepEqual(second, first)
  assert.equal(calls, 1, "run() ne doit être exécuté qu'une seule fois pour la même idempotencyKey")
})

test("withGuestIdempotency : deux clés différentes exécutent run() deux fois", async () => {
  const { redis } = makeMockRedis()
  let calls = 0
  const run = async () => {
    calls += 1
    return { ok: true, n: calls }
  }

  const first = await withGuestIdempotency("guest-key-A", run, redis)
  const second = await withGuestIdempotency("guest-key-B", run, redis)

  assert.equal(first.n, 1)
  assert.equal(second.n, 2)
  assert.equal(calls, 2)
})

test("withGuestIdempotency : met aussi en cache les résultats d'échec (ok:false) — pas de re-tentative silencieuse d'un paiement déjà refusé", async () => {
  const { redis } = makeMockRedis()
  let calls = 0
  const run = async () => {
    calls += 1
    return { ok: false as const, error: "paiement refusé", code: "PAYMENT_DECLINED" }
  }

  const first = await withGuestIdempotency("guest-key-fail", run, redis)
  const second = await withGuestIdempotency("guest-key-fail", run, redis)

  assert.deepEqual(second, first)
  assert.equal(calls, 1)
})
