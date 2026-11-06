/**
 * AVAILABILITY-REDIS-PROD-01 — l'intégration Upstash de Vercel crée
 * KV_REST_API_URL / KV_REST_API_TOKEN ; le code lisait seulement
 * UPSTASH_REDIS_REST_*. Sans ce repli, le verrou d'inventaire (fail-closed)
 * refusait toute réservation hôtel malgré Redis configuré.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolveRedisRestEnv } from "../redis"

test("noms historiques UPSTASH_* prioritaires", () => {
  assert.deepEqual(
    resolveRedisRestEnv({
      UPSTASH_REDIS_REST_URL: "https://u",
      UPSTASH_REDIS_REST_TOKEN: "ut",
      KV_REST_API_URL: "https://k",
      KV_REST_API_TOKEN: "kt",
    }),
    { url: "https://u", token: "ut", source: "upstash" },
  )
})

test("repli sur KV_REST_API_* (intégration Vercel)", () => {
  assert.deepEqual(
    resolveRedisRestEnv({
      KV_REST_API_URL: "https://k",
      KV_REST_API_TOKEN: "kt",
    }),
    { url: "https://k", token: "kt", source: "kv" },
  )
})

test("jamais de paire mélangée, jamais le jeton en lecture seule", () => {
  assert.equal(
    resolveRedisRestEnv({
      UPSTASH_REDIS_REST_URL: "https://u",
      KV_REST_API_TOKEN: "kt",
    }),
    null,
  )
  assert.equal(
    resolveRedisRestEnv({
      KV_REST_API_URL: "https://k",
      KV_REST_API_READ_ONLY_TOKEN: "ro",
    }),
    null,
  )
  // Paire UPSTASH incomplète → repli KV complet.
  assert.equal(
    resolveRedisRestEnv({
      UPSTASH_REDIS_REST_URL: "https://u",
      KV_REST_API_URL: "https://k",
      KV_REST_API_TOKEN: "kt",
    })?.source,
    "kv",
  )
  assert.equal(resolveRedisRestEnv({}), null)
})

test("getRedis et le préchauffage du cache passent par le même résolveur", () => {
  const redis = readFileSync("lib/cache/redis.ts", "utf8")
  assert.match(redis, /const creds = resolveRedisRestEnv\(\)/)
  assert.doesNotMatch(redis, /READ_ONLY_TOKEN\b(?![^\n]*JAMAIS)/)
  assert.match(
    readFileSync("app/api/cron/warm-cache/route.ts", "utf8"),
    /if \(!resolveRedisRestEnv\(\)\)/,
  )
})
