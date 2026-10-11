/**
 * Robustesse des lectures publiques storefront.
 *
 * Deux familles :
 * A. Purs (aucune connexion DB) — logique withFallback et catch silencieux.
 * B. Live (skip gracieux sans DATABASE_URL) — withPublicReadContext + statement_timeout.
 */
import test, { before } from "node:test"
import assert from "node:assert/strict"
import { sql } from "drizzle-orm"
import { withSystemContext, withPublicReadContext } from "@/lib/db/tenant-context"

// ---------------------------------------------------------------------------
// Helper — reproduit la logique de withFallback définie dans page.tsx
// ---------------------------------------------------------------------------

function withFallback<T>(
  label: string,
  promise: Promise<T>,
  fallback: T,
  timeoutMs = 200,
): Promise<T> {
  let settled = false
  const settled$ = promise.then(
    (v) => { settled = true; return v },
    () => { settled = true; return fallback },
  )
  const timeout$ = new Promise<T>((r) => setTimeout(() => { r(fallback) }, timeoutMs))
  void label
  return Promise.race([settled$, timeout$])
}

// ---------------------------------------------------------------------------
// Live DB availability check
// ---------------------------------------------------------------------------

let dbAvailable = false

before(async () => {
  try {
    await withSystemContext(async (tx) => { await tx.execute(sql`select 1`) })
    dbAvailable = true
  } catch {
    dbAvailable = false
  }
})

// ---------------------------------------------------------------------------
// A. Tests purs — withFallback
// ---------------------------------------------------------------------------

test("withFallback : retourne le résultat si la promesse se résout rapidement", async () => {
  const result = await withFallback("fast", Promise.resolve(["item1", "item2"]), [])
  assert.deepEqual(result, ["item1", "item2"])
})

test("withFallback : retourne le fallback si la promesse est plus lente que le timeout", async () => {
  const slow = new Promise<string[]>((r) => setTimeout(() => r(["late"]), 500))
  const result = await withFallback("slow", slow, [], 100)
  assert.deepEqual(result, [])
})

test("withFallback : retourne le fallback si la promesse rejette", async () => {
  const result = await withFallback("failing", Promise.reject(new Error("DB error")), null)
  assert.equal(result, null)
})

test("withFallback : retourne le résultat si la promesse se résout avant le timeout", async () => {
  const nearTimeout = new Promise<number>((r) => setTimeout(() => r(42), 50))
  const result = await withFallback("near", nearTimeout, 0, 200)
  assert.equal(result, 42)
})

// ---------------------------------------------------------------------------
// A. Tests purs — comportement catch silencieux (simulation pool exhausted)
// ---------------------------------------------------------------------------

test("getPublicPromotions catch : retourne [] quand source rejette → FlashOffers render null", async () => {
  const failingSource: Promise<{ id: string }[]> = Promise.reject(new Error("pool exhausted"))
  const offers = await failingSource.catch(() => [])
  assert.deepEqual(offers, [])
  assert.equal(offers.length === 0, true) // FlashOffers : if (offers.length === 0) return null
})

test("getPublicPromotions catch : retourne les données quand source réussit → FlashOffers visible", async () => {
  const source = Promise.resolve([{ id: "promo-1", destination: "Istanbul", href: "/istanbul" }])
  const offers = await source.catch(() => [])
  assert.equal(offers.length, 1)
  assert.equal(offers[0]?.id, "promo-1")
})

test("getPublicModuleVisuals catch : retourne [] → BookingEngine sans visuels par onglet", async () => {
  type ModuleRow = { moduleSlug: string; heroImageUrl: string | null }
  const failingSource: Promise<ModuleRow[]> = Promise.reject(new Error("pool exhausted"))
  const modules: ModuleRow[] = await failingSource.catch(() => [])
  assert.deepEqual(modules, [])
  const visuelVols = modules.find((m: ModuleRow) => m.moduleSlug === "vols")
  assert.equal(visuelVols, undefined) // BookingEngine → pas de visuel par onglet vols
})

// ---------------------------------------------------------------------------
// B. Tests live — withPublicReadContext avec Postgres réel
// ---------------------------------------------------------------------------

test("withPublicReadContext (live) : exécute une requête rapide et retourne le résultat", async (t) => {
  if (!dbAvailable) { t.skip("Postgres indisponible"); return }
  const rows = await withPublicReadContext(async (tx) => {
    return (await tx.execute(sql`select 1 as n`)) as Array<{ n: number }>
  })
  assert.equal(rows[0]?.n, 1)
})

test("withPublicReadContext (live) : statement_timeout est positionné à 1 500 ms", async (t) => {
  if (!dbAvailable) { t.skip("Postgres indisponible"); return }
  const timeout = await withPublicReadContext(async (tx) => {
    const rows = (await tx.execute(
      sql`select current_setting('statement_timeout') as timeout`,
    )) as Array<{ timeout: string }>
    return rows[0]?.timeout
  })
  assert.match(timeout ?? "", /^1500/)
})

test("withPublicReadContext (live) : query > 1 500 ms lève une erreur DB (statement timeout)", async (t) => {
  if (!dbAvailable) { t.skip("Postgres indisponible"); return }
  await assert.rejects(
    () => withPublicReadContext(async (tx) => {
      await tx.execute(sql`select pg_sleep(2)`)
    }),
    /timeout|canceling/i,
  )
})

test("withPublicReadContext (live) : catch() retourne [] si la requête dépasse le timeout", async (t) => {
  if (!dbAvailable) { t.skip("Postgres indisponible"); return }
  const result = await withPublicReadContext(async (tx) => {
    await tx.execute(sql`select pg_sleep(2)`)
    return ["should not reach"]
  }).catch(() => [] as string[])
  assert.deepEqual(result, [])
})
