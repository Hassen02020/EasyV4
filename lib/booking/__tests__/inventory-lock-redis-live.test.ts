/**
 * Verrou d'inventaire sur un VRAI Redis local, en concurrence — environnement
 * de test contrôlé : un `redis-server` éphémère sur 127.0.0.1 (port aléatoire,
 * sans persistance), AUCUN appel fournisseur (le « fournisseur » est un
 * compteur), aucun service externe. Ignoré si `redis-server` est absent (CI
 * GitHub : non installé).
 *
 * Question posée (cadre de la validation de DRAFT-PII-URL-02) : withGuestIdempotency
 * n'est pas atomique — N requêtes concurrentes de MÊME clé entrent toutes dans
 * run(). Le verrou d'inventaire (SET NX atomique) laisse-t-il quand même passer
 * UN SEUL appel « fournisseur » ? Ce test le MESURE ; il ne corrige rien.
 */
import test, { after, before } from "node:test"
import assert from "node:assert/strict"
import {
  execFile,
  spawn,
  spawnSync,
  type ChildProcess,
} from "node:child_process"
import { randomUUID } from "node:crypto"
import { promisify } from "node:util"
import { acquireLock, releaseLock, type InventoryRedis } from "../inventory"
import { withGuestIdempotency } from "../guest-idempotency"

const run = promisify(execFile)
const hasRedis = spawnSync("redis-server", ["--version"]).status === 0
const PORT = 20000 + Math.floor(Math.random() * 20000)
let server: ChildProcess | null = null

async function cli(...args: string[]): Promise<string> {
  const { stdout } = await run("redis-cli", ["-p", String(PORT), ...args])
  return stdout.trim()
}

/** Adaptateur InventoryRedis → vrai Redis (redis-cli), SET NX EX atomique côté serveur. */
const realRedis: InventoryRedis = {
  get: async <T>(key: string) => {
    const v = await cli("get", key)
    return (v === "" ? null : v) as T | null
  },
  set: async (key, value, opts) => {
    const args = ["set", key, value]
    if (opts?.ex) args.push("EX", String(opts.ex))
    if (opts?.nx) args.push("NX")
    const out = await cli(...args)
    return out === "OK" ? "OK" : null
  },
  expire: async (key, s) => cli("expire", key, String(s)),
  del: async (key) => cli("del", key),
  ttl: async (key) => Number(await cli("ttl", key)),
}

before(async () => {
  if (!hasRedis) return
  server = spawn(
    "redis-server",
    [
      "--port",
      String(PORT),
      "--bind",
      "127.0.0.1",
      "--save",
      "",
      "--appendonly",
      "no",
    ],
    { stdio: "ignore" },
  )
  for (let i = 0; i < 50; i++) {
    try {
      if ((await cli("ping")) === "PONG") return
    } catch {
      /* démarrage en cours */
    }
    await new Promise((r) => setTimeout(r, 100))
  }
})

after(() => {
  server?.kill("SIGTERM")
})

const skip = () => "redis-server absent (environnement sans Redis local)."

test("vrai Redis : 8 acquireLock concurrents, même offre, sessions distinctes → UN seul gagnant", async (t) => {
  if (!hasRedis) return void t.skip(skip())
  const agencyId = randomUUID()
  const itemId = `offer-${randomUUID()}`
  const results = await Promise.all(
    Array.from({ length: 8 }, () =>
      acquireLock(
        { agencyId, sessionId: randomUUID(), module: "hotel", itemId },
        realRedis,
      ),
    ),
  )
  const ok = results.filter((r) => r.ok).length
  const conflicts = results.filter(
    (r) => !r.ok && r.reason === "conflict",
  ).length
  console.log(`LOCK_CONCURRENT winners=${ok} conflicts=${conflicts}`)
  assert.equal(ok, 1)
  assert.equal(conflicts, 7)
})

test("vrai Redis : même sessionId ré-acquiert (idempotent) ; libéré → un autre peut acquérir", async (t) => {
  if (!hasRedis) return void t.skip(skip())
  const agencyId = randomUUID()
  const itemId = `offer-${randomUUID()}`
  const s1 = randomUUID()
  assert.equal(
    (
      await acquireLock(
        { agencyId, sessionId: s1, module: "hotel", itemId },
        realRedis,
      )
    ).ok,
    true,
  )
  assert.equal(
    (
      await acquireLock(
        { agencyId, sessionId: s1, module: "hotel", itemId },
        realRedis,
      )
    ).ok,
    true,
  )
  const s2 = randomUUID()
  assert.equal(
    (
      await acquireLock(
        { agencyId, sessionId: s2, module: "hotel", itemId },
        realRedis,
      )
    ).ok,
    false,
  )
  await releaseLock(
    { agencyId, sessionId: s1, module: "hotel", itemId },
    realRedis,
  )
  assert.equal(
    (
      await acquireLock(
        { agencyId, sessionId: s2, module: "hotel", itemId },
        realRedis,
      )
    ).ok,
    true,
  )
})

test("vrai Redis : deux agences, même offre → verrous indépendants", async (t) => {
  if (!hasRedis) return void t.skip(skip())
  const itemId = `offer-${randomUUID()}`
  const [a, b] = await Promise.all([
    acquireLock(
      {
        agencyId: randomUUID(),
        sessionId: randomUUID(),
        module: "hotel",
        itemId,
      },
      realRedis,
    ),
    acquireLock(
      {
        agencyId: randomUUID(),
        sessionId: randomUUID(),
        module: "hotel",
        itemId,
      },
      realRedis,
    ),
  ])
  assert.equal(a.ok && b.ok, true)
})

test("MESURE — 5 requêtes concurrentes de MÊME clé d'idempotence : combien d'appels « fournisseur » ?", async (t) => {
  if (!hasRedis) return void t.skip(skip())
  // Cache d'idempotence sur le même vrai Redis (interface réduite de guest-idempotency).
  const idemRedis = {
    get: realRedis.get,
    set: async (k: string, v: string, o?: { ex: number }) =>
      realRedis.set(k, v, o),
  }
  const agencyId = randomUUID()
  const offer = `offer-${randomUUID()}`
  const key = `idem-${randomUUID()}`
  let runEntries = 0
  let supplierCalls = 0
  const outcomes = await Promise.all(
    Array.from({ length: 5 }, () =>
      withGuestIdempotency(
        key,
        async () => {
          runEntries++
          const sessionId = randomUUID() // frais par invocation, comme guest-actions.ts
          const lock = await acquireLock(
            { agencyId, sessionId, module: "hotel", itemId: offer },
            realRedis,
          )
          if (!lock.ok) return { ok: false as const, reason: lock.reason }
          supplierCalls++ // « appel fournisseur » simulé : un simple compteur
          await new Promise((r) => setTimeout(r, 150))
          await releaseLock(
            { agencyId, sessionId, module: "hotel", itemId: offer },
            realRedis,
          )
          return { ok: true as const }
        },
        idemRedis,
      ),
    ),
  )
  console.log(
    `IDEM_CONCURRENT run_entries=${runEntries} supplier_calls=${supplierCalls} refused=${outcomes.filter((o) => !o.ok).length}`,
  )
  // Constat : toutes les requêtes entrent dans run() (garde non atomique) ...
  assert.equal(runEntries, 5)
  // ... mais le verrou d'inventaire ne laisse passer qu'UN seul appel « fournisseur ».
  assert.equal(supplierCalls, 1)
})
