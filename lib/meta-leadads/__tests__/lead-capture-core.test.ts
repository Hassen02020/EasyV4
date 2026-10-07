/**
 * META-LEADADS-WEBHOOK-01 — preuve live contre un Postgres réel, même
 * convention que lib/crm/__tests__/inbox-core.test.ts.
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
import { agencies, contacts, leads } from "@/lib/db/schema"
import { captureMetaLeadCore } from "../lead-capture-core"
import type { MetaLeadFieldData } from "../provider"

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
const skipReason = () => "Postgres local indisponible (DATABASE_URL)."

let agencyId = ""

before(async () => {
  dbAvailable = await isDbAvailable()
  if (!dbAvailable) return
  agencyId = randomUUID()
  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values({
      id: agencyId,
      name: "META-LEADADS-WEBHOOK-01 Agency",
      agencyType: "ota",
      slug: `meta-leadads-${agencyId.slice(0, 8)}`,
    })
  })
})

after(async () => {
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    await tx.delete(contacts).where(eq(contacts.agencyId, agencyId))
    await tx.delete(leads).where(eq(leads.agencyId, agencyId))
    await tx.delete(agencies).where(eq(agencies.id, agencyId))
  })
})

function ctx(): TenantContext {
  return { agencyId, userId: "", isSuperAdmin: true }
}

function fieldData(
  leadgenId: string,
  fields: Record<string, string>,
): MetaLeadFieldData {
  return { leadgenId, fields, createdTime: new Date().toISOString() }
}

test("captureMetaLeadCore : email présent → crée lead + contact (channel='email')", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const leadgenId = `lg_${randomUUID()}`

  const result = await withTenantContext(ctx(), (tx) =>
    captureMetaLeadCore(tx, {
      agencyId,
      data: fieldData(leadgenId, {
        email: "client@example.test",
        full_name: "Amine Test",
        destination: "Hammamet",
      }),
    }),
  )

  assert.equal(result.alreadyProcessed, false)
  assert.ok(result.contactId)

  const [lead] = await withTenantContext(ctx(), (tx) =>
    tx.select().from(leads).where(eq(leads.id, result.leadId)),
  )
  assert.equal(lead!.email, "client@example.test")
  assert.equal(lead!.firstName, "Amine Test")
  assert.equal(lead!.destination, "Hammamet")
  assert.equal(lead!.sourcePage, `meta_leadads:${leadgenId}`)

  const [contact] = await withTenantContext(ctx(), (tx) =>
    tx.select().from(contacts).where(eq(contacts.id, result.contactId!)),
  )
  assert.equal(contact!.channel, "email")
  assert.equal(contact!.contactRef, "client@example.test")
})

test("captureMetaLeadCore : seulement téléphone → contact résolu channel='call'", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const leadgenId = `lg_${randomUUID()}`

  const result = await withTenantContext(ctx(), (tx) =>
    captureMetaLeadCore(tx, {
      agencyId,
      data: fieldData(leadgenId, { phone_number: "21620000099" }),
    }),
  )

  assert.ok(result.contactId)
  const [contact] = await withTenantContext(ctx(), (tx) =>
    tx.select().from(contacts).where(eq(contacts.id, result.contactId!)),
  )
  assert.equal(contact!.channel, "call")
  assert.equal(contact!.contactRef, "+21620000099")
})

test("captureMetaLeadCore : ni email ni téléphone → lead créé, contactId null (jamais un contact fabriqué)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const leadgenId = `lg_${randomUUID()}`

  const result = await withTenantContext(ctx(), (tx) =>
    captureMetaLeadCore(tx, {
      agencyId,
      data: fieldData(leadgenId, { some_other_question: "oui" }),
    }),
  )

  assert.equal(result.contactId, null)
  const [lead] = await withTenantContext(ctx(), (tx) =>
    tx.select().from(leads).where(eq(leads.id, result.leadId)),
  )
  assert.equal(lead!.email, null)
  assert.equal(lead!.phone, null)
})

test("captureMetaLeadCore : redélivrance du même leadgenId → idempotent, jamais un lead dupliqué", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const leadgenId = `lg_${randomUUID()}`
  const data = fieldData(leadgenId, { email: "redelivery@example.test" })

  const first = await withTenantContext(ctx(), (tx) =>
    captureMetaLeadCore(tx, { agencyId, data }),
  )
  assert.equal(first.alreadyProcessed, false)

  const second = await withTenantContext(ctx(), (tx) =>
    captureMetaLeadCore(tx, { agencyId, data }),
  )
  assert.equal(second.alreadyProcessed, true)
  assert.equal(second.leadId, first.leadId)

  const matching = await withTenantContext(ctx(), (tx) =>
    tx
      .select()
      .from(leads)
      .where(eq(leads.sourcePage, `meta_leadads:${leadgenId}`)),
  )
  assert.equal(
    matching.length,
    1,
    "jamais un lead dupliqué pour le même leadgenId",
  )
})
