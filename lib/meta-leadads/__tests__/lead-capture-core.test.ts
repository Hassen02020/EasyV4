/**
 * META-LEADADS-WEBHOOK-01 — preuve live contre un Postgres réel, même
 * convention que lib/crm/__tests__/inbox-core.test.ts.
 */
import { cleanupAsSuperuserWithDrizzle } from "@/lib/db/test-helpers/superuser-cleanup"
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
import { processLeadgenBatchCore, type LeadgenFailure } from "../webhook-batch"
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
  await cleanupAsSuperuserWithDrizzle(async (tx) => {
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

test("CRM-LEADADS-UNIQUE-01 (G-17) : livraisons SIMULTANÉES du même leadgenId → un seul lead (verrou)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const leadgenId = `lg_${randomUUID()}`
  const data = fieldData(leadgenId, { email: "concurrent@example.test" })

  const results = await Promise.all(
    [1, 2, 3].map(() =>
      withTenantContext(ctx(), (tx) =>
        captureMetaLeadCore(tx, { agencyId, data }),
      ),
    ),
  )
  assert.equal(results.filter((r) => !r.alreadyProcessed).length, 1)
  assert.equal(new Set(results.map((r) => r.leadId)).size, 1)

  const matching = await withSystemContext((tx) =>
    tx
      .select({ id: leads.id })
      .from(leads)
      .where(eq(leads.sourcePage, `meta_leadads:${leadgenId}`)),
  )
  assert.equal(matching.length, 1)
})

test("CRM-LEADADS-UNIQUE-01 (G-17, 0147) : la base refuse un 2e lead pour le même leadgen_id, même sans verrou ; le site garde ses doublons légitimes", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const sourcePage = `meta_leadads:lg_${randomUUID()}`
  const insert = (page: string) =>
    withSystemContext((tx) =>
      tx
        .insert(leads)
        .values({ agencyId, firstName: "Direct", sourcePage: page }),
    )

  await insert(sourcePage)
  await assert.rejects(insert(sourcePage), (err: unknown) => {
    const code =
      (err as { code?: string }).code ??
      (err as { cause?: { code?: string } }).cause?.code
    return code === "23505"
  })

  // Index PARTIEL : deux demandes du site sur la même page restent permises.
  await insert("/hotels/519")
  await insert("/hotels/519")
})

test("G-17 : conflit RÉEL sur l'index Meta (23505) → échec tracé, réponse 500 ; relivraison Meta → lead existant, ni doublon ni second email", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const leadgenId = `lg_${randomUUID()}`
  const sourcePage = `meta_leadads:${leadgenId}`
  const data = fieldData(leadgenId, { email: "race@example.test" })

  // Un concurrent a déjà enregistré ce leadgen_id (cas d'un chemin sans
  // verrou) : la 2e insertion se heurte à l'index 0147.
  await withSystemContext((tx) =>
    tx.insert(leads).values({ agencyId, firstName: "Gagnant", sourcePage }),
  )

  const recorded: LeadgenFailure[] = []
  const notified: string[] = []
  let dbCode: string | undefined
  const first = await processLeadgenBatchCore([leadgenId], {
    fetchLead: async () => ({ ok: true, lead: data }),
    // Perdant de la course : insertion directe, sans lecture préalable.
    capture: async () => {
      try {
        await withSystemContext((tx) =>
          tx
            .insert(leads)
            .values({ agencyId, firstName: "Perdant", sourcePage }),
        )
      } catch (err) {
        dbCode =
          (err as { code?: string }).code ??
          (err as { cause?: { code?: string } }).cause?.code
        throw err
      }
      throw new Error("insertion inattendue : l'index aurait dû refuser")
    },
    notifyCreated: async (id) => void notified.push(id),
    recordFailure: async (f) => void recorded.push(f),
  })
  assert.equal(dbCode, "23505", "erreur d'unicité levée par Postgres")
  assert.deepEqual(first.failures, [
    { leadgenId, code: "META_LEADADS_CAPTURE_FAILED" },
  ])
  assert.deepEqual(recorded, first.failures) // → la route répond 500

  // Relivraison Meta, code réel : lead existant reconnu, aucune notification.
  const second = await processLeadgenBatchCore([leadgenId], {
    fetchLead: async () => ({ ok: true, lead: data }),
    capture: (lead) =>
      withTenantContext(ctx(), (tx) =>
        captureMetaLeadCore(tx, { agencyId, data: lead }),
      ),
    notifyCreated: async (id) => void notified.push(id),
    recordFailure: async (f) => void recorded.push(f),
  })
  assert.deepEqual(second, { processed: 1, failures: [] })
  assert.deepEqual(notified, [])

  const rows = await withSystemContext((tx) =>
    tx
      .select({ id: leads.id })
      .from(leads)
      .where(eq(leads.sourcePage, sourcePage)),
  )
  assert.equal(rows.length, 1)
})
