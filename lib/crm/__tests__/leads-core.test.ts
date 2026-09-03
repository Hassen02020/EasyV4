/**
 * CRM / Leads — preuve live contre un Postgres réel (RLS incluse via
 * withTenantContext), même convention que
 * lib/favorites/__tests__/favorites-core.test.ts : se dégrade en `skip`
 * sans DATABASE_URL/Postgres local disponible.
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { withTenantContext, withSystemContext, type TenantContext } from "@/lib/db/tenant-context"
import { agencies, leads } from "@/lib/db/schema"
import { createLeadCore, listLeadsCore, updateLeadStatusCore } from "../leads-core"

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
      { id: agencyA, name: "LEADS Agency A", agencyType: "ota", slug: `leads-a-${agencyA.slice(0, 8)}` },
      { id: agencyB, name: "LEADS Agency B", agencyType: "ota", slug: `leads-b-${agencyB.slice(0, 8)}` },
    ])
  })
})

after(async () => {
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    await tx.delete(leads).where(eq(leads.agencyId, agencyA))
    await tx.delete(leads).where(eq(leads.agencyId, agencyB))
    await tx.delete(agencies).where(eq(agencies.id, agencyA))
    await tx.delete(agencies).where(eq(agencies.id, agencyB))
  })
})

test("createLeadCore + listLeadsCore : le lead créé apparaît, isolé par agence", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctxA: TenantContext = { agencyId: agencyA, userId: "", isSuperAdmin: true }
  const ctxB: TenantContext = { agencyId: agencyB, userId: "", isSuperAdmin: true }

  await withTenantContext(ctxA, (tx) =>
    createLeadCore(tx, {
      agencyId: agencyA,
      firstName: "Amine",
      email: "amine@example.com",
      productType: "package",
      productRef: "pkg-1",
      productLabel: "Voyage Istanbul",
      sourcePage: "/packages/istanbul",
    }),
  )

  const listedA = await withTenantContext(ctxA, (tx) => listLeadsCore(tx, { agencyId: agencyA }))
  const listedB = await withTenantContext(ctxB, (tx) => listLeadsCore(tx, { agencyId: agencyB }))

  assert.equal(listedA.length, 1)
  assert.equal(listedA[0]!.firstName, "Amine")
  assert.equal(listedA[0]!.status, "new")
  assert.equal(listedB.length, 0)
})

test("listLeadsCore : filtre par statut", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctx: TenantContext = { agencyId: agencyA, userId: "", isSuperAdmin: true }

  await withTenantContext(ctx, (tx) =>
    createLeadCore(tx, {
      agencyId: agencyA,
      firstName: "Sara",
      phone: "+21620000000",
      productType: "general",
      sourcePage: "/",
    }),
  )

  const allLeads = await withTenantContext(ctx, (tx) => listLeadsCore(tx, { agencyId: agencyA }))
  const target = allLeads.find((l) => l.firstName === "Sara")!

  await withTenantContext(ctx, (tx) =>
    updateLeadStatusCore(tx, {
      agencyId: agencyA,
      id: target.id,
      status: "contacted",
      handledByUserId: randomUUID(),
    }),
  )

  const contactedOnly = await withTenantContext(ctx, (tx) =>
    listLeadsCore(tx, { agencyId: agencyA, status: "contacted" }),
  )
  assert.ok(contactedOnly.some((l) => l.id === target.id))

  const newOnly = await withTenantContext(ctx, (tx) => listLeadsCore(tx, { agencyId: agencyA, status: "new" }))
  assert.ok(!newOnly.some((l) => l.id === target.id))
})

test("updateLeadStatusCore : n'affecte jamais un lead d'une autre agence", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctxA: TenantContext = { agencyId: agencyA, userId: "", isSuperAdmin: true }
  const ctxB: TenantContext = { agencyId: agencyB, userId: "", isSuperAdmin: true }

  await withTenantContext(ctxA, (tx) =>
    createLeadCore(tx, {
      agencyId: agencyA,
      firstName: "Yassine",
      email: "yassine@example.com",
      productType: "general",
      sourcePage: "/",
    }),
  )
  const listedA = await withTenantContext(ctxA, (tx) => listLeadsCore(tx, { agencyId: agencyA }))
  const leadId = listedA.find((l) => l.firstName === "Yassine")!.id

  const attempt = await withTenantContext(ctxB, (tx) =>
    updateLeadStatusCore(tx, {
      agencyId: agencyB,
      id: leadId,
      status: "closed",
      handledByUserId: randomUUID(),
    }),
  )
  assert.equal(attempt.updated, false)

  const stillNew = await withTenantContext(ctxA, (tx) => listLeadsCore(tx, { agencyId: agencyA }))
  assert.equal(stillNew.find((l) => l.id === leadId)!.status, "new")
})
