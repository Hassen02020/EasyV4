/**
 * Verrous d'inventaire — preuve live contre un Postgres réel, même
 * convention que lib/crm/__tests__/leads-core.test.ts : se dégrade en
 * `skip` sans DATABASE_URL/Postgres local disponible.
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { withTenantContext, withSystemContext, type TenantContext } from "@/lib/db/tenant-context"
import { agencies, inventoryLocks } from "@/lib/db/schema"
import { listInventoryLocksCore } from "../inventory-locks-core"

async function isDbAvailable(): Promise<boolean> {
  try {
    await withSystemContext(async (tx) => {
      await tx.execute(sql`select 1`)
    })
    return true
  } catch {
    return false
  }
}

let dbAvailable = false
const skipReason = () =>
  "Postgres local indisponible (DATABASE_URL) — voir live-resolution.test.ts pour la procédure."

let agencyA = ""
let agencyB = ""

before(async () => {
  dbAvailable = await isDbAvailable()
  if (!dbAvailable) return

  agencyA = randomUUID()
  agencyB = randomUUID()

  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values([
      { id: agencyA, name: "LOCKS Agency A", agencyType: "ota", slug: `locks-a-${agencyA.slice(0, 8)}` },
      { id: agencyB, name: "LOCKS Agency B", agencyType: "ota", slug: `locks-b-${agencyB.slice(0, 8)}` },
    ])
    await tx.insert(inventoryLocks).values([
      {
        agencyId: agencyA,
        redisKey: `e2b:lock:hotel:test-a-${agencyA}`,
        module: "hotel",
        itemId: "offer-a",
        sessionId: "session-a",
        status: "active",
        expiresAt: new Date(Date.now() + 600_000),
      },
      {
        agencyId: agencyA,
        redisKey: `e2b:lock:hotel:test-a2-${agencyA}`,
        module: "hotel",
        itemId: "offer-a2",
        sessionId: "session-a2",
        status: "expired",
        expiresAt: new Date(Date.now() - 600_000),
      },
      {
        agencyId: agencyB,
        redisKey: `e2b:lock:hotel:test-b-${agencyB}`,
        module: "hotel",
        itemId: "offer-b",
        sessionId: "session-b",
        status: "active",
        expiresAt: new Date(Date.now() + 600_000),
      },
    ])
  })
})

after(async () => {
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    await tx.delete(inventoryLocks).where(eq(inventoryLocks.agencyId, agencyA))
    await tx.delete(inventoryLocks).where(eq(inventoryLocks.agencyId, agencyB))
    await tx.delete(agencies).where(eq(agencies.id, agencyA))
    await tx.delete(agencies).where(eq(agencies.id, agencyB))
  })
})

test("listInventoryLocksCore : isolation par agence", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctxA: TenantContext = { agencyId: agencyA, userId: "", isSuperAdmin: true }
  const ctxB: TenantContext = { agencyId: agencyB, userId: "", isSuperAdmin: true }

  const listedA = await withTenantContext(ctxA, (tx) => listInventoryLocksCore(tx, { agencyId: agencyA }))
  const listedB = await withTenantContext(ctxB, (tx) => listInventoryLocksCore(tx, { agencyId: agencyB }))

  assert.equal(listedA.length, 2)
  assert.equal(listedB.length, 1)
  assert.ok(listedA.every((l) => l.agencyId === agencyA))
})

test("listInventoryLocksCore : filtre par statut", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctxA: TenantContext = { agencyId: agencyA, userId: "", isSuperAdmin: true }

  const activeOnly = await withTenantContext(ctxA, (tx) =>
    listInventoryLocksCore(tx, { agencyId: agencyA, status: "active" }),
  )
  assert.equal(activeOnly.length, 1)
  assert.equal(activeOnly[0]!.itemId, "offer-a")

  const expiredOnly = await withTenantContext(ctxA, (tx) =>
    listInventoryLocksCore(tx, { agencyId: agencyA, status: "expired" }),
  )
  assert.equal(expiredOnly.length, 1)
  assert.equal(expiredOnly[0]!.itemId, "offer-a2")
})
