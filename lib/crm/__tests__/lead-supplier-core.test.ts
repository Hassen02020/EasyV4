/**
 * CRM / J5 Lead→Supplier — résolution structurelle lead ↔ supplier_node.
 * Tests live contre Postgres réel (même convention que leads-core.test.ts) :
 * se dégrade en `skip` si DATABASE_URL / Postgres local indisponible.
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import {
  withTenantContext,
  withSystemContext,
  type TenantContext,
} from "@/lib/db/tenant-context"
import {
  agencies,
  leads,
  suppliers,
  supplierNodes,
} from "@/lib/db/schema"
import { createLeadCore } from "../leads-core"
import {
  resolveLeadSupplierCore,
  listLeadsBySupplierCore,
} from "../lead-supplier-core"

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

let agencyId = ""
let supplierId = ""
let supplierNodeId = ""

before(async () => {
  dbAvailable = await isDbAvailable()
  if (!dbAvailable) return

  agencyId = randomUUID()
  supplierId = randomUUID()
  supplierNodeId = randomUUID()

  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values({
      id: agencyId,
      name: "J5 Test Agency",
      agencyType: "ota",
      slug: `j5-test-${agencyId.slice(0, 8)}`,
    })

    await tx.insert(suppliers).values({
      id: supplierId,
      name: "J5 Test Supplier",
      type: "custom",
    })

    await tx.insert(supplierNodes).values({
      id: supplierNodeId,
      supplierId,
      slug: `j5-test-node-${supplierNodeId.slice(0, 8)}`,
      displayName: "J5 Test Node",
    })
  })
})

after(async () => {
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    await tx.delete(leads).where(eq(leads.agencyId, agencyId))
    await tx.delete(supplierNodes).where(eq(supplierNodes.id, supplierNodeId))
    await tx.delete(suppliers).where(eq(suppliers.id, supplierId))
    await tx.delete(agencies).where(eq(agencies.id, agencyId))
  })
})

const ctx = (): TenantContext => ({
  agencyId,
  userId: "",
  isSuperAdmin: true,
})

test("createLeadCore avec supplierNodeId → lead persiste le lien", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const { id } = await withTenantContext(ctx(), (tx) =>
    createLeadCore(tx, {
      agencyId,
      firstName: "Ali",
      email: "ali@example.com",
      productType: "general",
      sourcePage: "/test",
      supplierNodeId,
    }),
  )
  const [row] = await withSystemContext((tx) =>
    tx
      .select({ supplierNodeId: leads.supplierNodeId })
      .from(leads)
      .where(eq(leads.id, id))
      .limit(1),
  )
  assert.equal(row?.supplierNodeId, supplierNodeId)
})

test("resolveLeadSupplierCore chemin 1 : via lead.supplierNodeId direct", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const { id: leadId } = await withTenantContext(ctx(), (tx) =>
    createLeadCore(tx, {
      agencyId,
      firstName: "Direct",
      email: "direct@example.com",
      productType: "general",
      sourcePage: "/test",
      supplierNodeId,
    }),
  )
  const result = await withTenantContext(ctx(), (tx) =>
    resolveLeadSupplierCore(tx, { supplierNodeId, reservationId: null }),
  )
  assert.ok(result !== null, "devrait résoudre le supplier_node")
  assert.equal(result!.id, supplierNodeId)
  assert.equal(result!.supplierId, supplierId)
  // Cleanup
  await withSystemContext((tx) =>
    tx.delete(leads).where(eq(leads.id, leadId)),
  )
})

test("resolveLeadSupplierCore : supplierNodeId null + reservationId null → null", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const result = await withTenantContext(ctx(), (tx) =>
    resolveLeadSupplierCore(tx, {
      supplierNodeId: null,
      reservationId: null,
    }),
  )
  assert.equal(result, null)
})

test("listLeadsBySupplierCore : retourne uniquement les leads du supplier", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())

  const { id: id1 } = await withTenantContext(ctx(), (tx) =>
    createLeadCore(tx, {
      agencyId,
      firstName: "ListTest1",
      email: "list1@example.com",
      productType: "general",
      sourcePage: "/list",
      supplierNodeId,
    }),
  )
  const { id: id2 } = await withTenantContext(ctx(), (tx) =>
    createLeadCore(tx, {
      agencyId,
      firstName: "ListTest2",
      email: "list2@example.com",
      productType: "general",
      sourcePage: "/list",
      supplierNodeId,
    }),
  )
  // Lead sans supplierNodeId — ne doit PAS apparaître
  const { id: id3 } = await withTenantContext(ctx(), (tx) =>
    createLeadCore(tx, {
      agencyId,
      firstName: "ClassicLead",
      email: "classic@example.com",
      productType: "hotel",
      sourcePage: "/hotel",
      supplierNodeId: null,
    }),
  )

  const listed = await withTenantContext(ctx(), (tx) =>
    listLeadsBySupplierCore(tx, { supplierNodeId }),
  )

  const ids = listed.map((l) => l.id)
  assert.ok(ids.includes(id1), "id1 doit être listé")
  assert.ok(ids.includes(id2), "id2 doit être listé")
  assert.ok(!ids.includes(id3), "id3 (classic) ne doit pas être listé")
  assert.ok(
    listed.every((l) => l.supplierNodeId === supplierNodeId),
    "tous les leads doivent avoir le bon supplierNodeId",
  )

  // Cleanup
  await withSystemContext((tx) =>
    tx
      .delete(leads)
      .where(
        sql`${leads.id} IN (${id1}, ${id2}, ${id3})`,
      ),
  )
})
