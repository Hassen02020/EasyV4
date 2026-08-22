/**
 * Tests unitaires — `createMemoryRateLimiter` (lib/rate-limit.ts).
 *
 * Couvre le fallback in-memory (actif quand Upstash n'est pas configuré,
 * ou explicitement injecté via `customLimiter`). Le chemin Upstash lui-même
 * n'est pas testé ici (nécessiterait de mocker `@upstash/ratelimit` sans
 * point d'injection dédié dans ce fichier) — le comportement "échec ouvert"
 * ajouté en Phase 12 (Partie 15 : panne/timeout Upstash → requête autorisée
 * plutôt que 500) est vérifié par inspection du code (try/catch autour de
 * `upstash.limit()`), pas par un test automatisé.
 */

import test from "node:test"
import assert from "node:assert/strict"

import { createMemoryRateLimiter } from "../rate-limit"

test("createMemoryRateLimiter : autorise les requêtes sous la limite", async () => {
  const limiter = createMemoryRateLimiter(60_000, 3)
  const r1 = await limiter("client-a")
  const r2 = await limiter("client-a")
  const r3 = await limiter("client-a")
  assert.equal(r1.ok, true)
  assert.equal(r2.ok, true)
  assert.equal(r3.ok, true)
  assert.equal(r3.remaining, 0)
})

test("createMemoryRateLimiter : bloque au-delà de la limite (429 attendu par l'appelant)", async () => {
  const limiter = createMemoryRateLimiter(60_000, 2)
  await limiter("client-b")
  await limiter("client-b")
  const blocked = await limiter("client-b")
  assert.equal(blocked.ok, false)
  assert.equal(blocked.remaining, 0)
})

test("createMemoryRateLimiter : deux identifiants distincts ont des compteurs indépendants", async () => {
  const limiter = createMemoryRateLimiter(60_000, 1)
  const a = await limiter("client-c")
  const b = await limiter("client-d")
  assert.equal(a.ok, true)
  assert.equal(b.ok, true)
})

test("createMemoryRateLimiter : la fenêtre expirée réinitialise le compteur", async () => {
  const limiter = createMemoryRateLimiter(10, 1) // fenêtre de 10ms
  const first = await limiter("client-e")
  assert.equal(first.ok, true)
  await new Promise((r) => setTimeout(r, 20))
  const second = await limiter("client-e")
  assert.equal(second.ok, true, "après expiration de la fenêtre, une nouvelle requête doit être autorisée")
})
