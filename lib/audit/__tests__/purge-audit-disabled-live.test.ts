/**
 * AUDIT-RETENTION-01, étape 1 — la route /api/cron/purge-audit ne supprime
 * plus rien tant que la Direction n'a pas fixé la politique de conservation.
 * Preuve sur PostgreSQL réel : une trace d'audit de 60 jours survit à un
 * appel authentifié (GET comme Vercel Cron, et POST).
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { eq, sql } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import { agencies, auditEvents } from "@/lib/db/schema"
import {
  GET,
  POST,
  PURGE_DISABLED_REASON,
} from "@/app/api/cron/purge-audit/route"

const SECRET = "test-cron-secret-audit-retention-01"
const previousSecret = process.env.CRON_SECRET
let dbAvailable = false

before(async () => {
  process.env.CRON_SECRET = SECRET
  try {
    await withSystemContext((tx) => tx.execute(sql`select 1`))
    dbAvailable = true
  } catch {
    dbAvailable = false
  }
})

after(() => {
  if (previousSecret === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = previousSecret
})

const req = (method: "GET" | "POST", token?: string) =>
  new Request("http://localhost/api/cron/purge-audit", {
    method,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  })

test("sans CRON_SECRET valide → 401, aucune action", async () => {
  for (const r of [req("GET"), req("GET", "faux"), req("POST", "faux")]) {
    const res = r.method === "GET" ? await GET(r) : await POST(r)
    assert.equal(res.status, 401)
  }
})

test("CRON_SECRET absent du serveur → 401 même avec un en-tête", async () => {
  delete process.env.CRON_SECRET
  try {
    const res = await GET(req("GET", "undefined"))
    assert.equal(res.status, 401)
  } finally {
    process.env.CRON_SECRET = SECRET
  }
})

test("live : appel authentifié (GET et POST) → purge désactivée, une trace de 60 jours survit", async (t) => {
  if (!dbAvailable)
    return void t.skip("Postgres local indisponible (DATABASE_URL).")
  const s = randomUUID().slice(0, 8)
  const id = await withSystemContext(async (tx) => {
    const [agency] = await tx
      .insert(agencies)
      .values({ name: `AR ${s}`, agencyType: "ota", slug: `audit-ret-${s}` })
      .returning({ id: agencies.id })
    const [row] = await tx
      .insert(auditEvents)
      .values({
        agencyId: agency!.id,
        entityType: "reservation",
        entityId: randomUUID(),
        action: "reservation.test_old",
        createdAt: new Date(Date.now() - 60 * 86_400_000),
      })
      .returning({ id: auditEvents.id })
    return row!.id
  })

  for (const method of ["GET", "POST"] as const) {
    const res =
      method === "GET"
        ? await GET(req("GET", SECRET))
        : await POST(req("POST", SECRET))
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), {
      ok: true,
      disabled: true,
      deleted: 0,
      reason: PURGE_DISABLED_REASON,
    })
  }

  const rows = await withSystemContext((tx) =>
    tx
      .select({ id: auditEvents.id })
      .from(auditEvents)
      .where(eq(auditEvents.id, id)),
  )
  assert.equal(rows.length, 1, "la trace de 60 jours n'a pas été supprimée")
})

test("la route ne contient plus aucune instruction de suppression", () => {
  const src = readFileSync("app/api/cron/purge-audit/route.ts", "utf8")
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "")
  assert.doesNotMatch(
    code,
    /\.delete\(|DELETE\s+FROM|withSystemContext|auditEvents/i,
  )
})
