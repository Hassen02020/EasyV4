/**
 * CONTACT-LEAD-HISTORY-01 — preuve live contre un Postgres réel, même
 * convention que lib/crm/__tests__/inbox-core.test.ts.
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import {
  withSystemContext,
  withTenantContext,
  type TenantContext,
} from "@/lib/db/tenant-context"
import { agencies, contacts, leads } from "@/lib/db/schema"
import { getContactLeadHistoryCore } from "../contact-history-core"
import { resolveOrCreateContactCore } from "../contact-core"
import { createLeadCore } from "../leads-core"
import { captureMetaLeadCore } from "@/lib/meta-leadads/lead-capture-core"

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
      name: "CONTACT-LEAD-HISTORY-01 Agency",
      agencyType: "ota",
      slug: `contact-history-${agencyId.slice(0, 8)}`,
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

test("getContactLeadHistoryCore : plusieurs leads distincts (même téléphone, 2 soumissions Meta Lead Ads) résolvent au même contact → historique complet, ordre chronologique", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const phone = "21620000031"

  const first = await withTenantContext(ctx(), (tx) =>
    captureMetaLeadCore(tx, {
      agencyId,
      data: {
        leadgenId: `lg_${randomUUID()}`,
        fields: { phone_number: phone, full_name: "Premier passage" },
        createdTime: new Date("2026-01-01T10:00:00Z").toISOString(),
      },
    }),
  )
  const second = await withTenantContext(ctx(), (tx) =>
    captureMetaLeadCore(tx, {
      agencyId,
      data: {
        leadgenId: `lg_${randomUUID()}`,
        fields: { phone_number: phone, full_name: "Deuxième passage" },
        createdTime: new Date("2026-02-01T10:00:00Z").toISOString(),
      },
    }),
  )

  assert.ok(first.contactId)
  assert.equal(
    second.contactId,
    first.contactId,
    "même téléphone, même contact",
  )
  assert.notEqual(
    second.leadId,
    first.leadId,
    "2 leads distincts (2 leadgenId différents)",
  )

  const history = await withTenantContext(ctx(), (tx) =>
    getContactLeadHistoryCore(tx, { agencyId, contactId: first.contactId! }),
  )

  assert.equal(history.length, 2)
  assert.equal(history[0]!.id, first.leadId, "ordre chronologique croissant")
  assert.equal(history[1]!.id, second.leadId)
  assert.equal(history[0]!.firstName, "Premier passage")
  assert.equal(history[1]!.firstName, "Deuxième passage")
})

test("getContactLeadHistoryCore : contact email avec un seul lead → historique d'un seul élément", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const email = "contact-history-single@example.test"

  const leadId = await withTenantContext(ctx(), (tx) =>
    createLeadCore(tx, {
      agencyId,
      firstName: "Solo",
      email,
      productType: "general",
      sourcePage: "web",
    }),
  )
  const contact = await withTenantContext(ctx(), (tx) =>
    resolveOrCreateContactCore(tx, {
      agencyId,
      channel: "email",
      rawRef: email,
    }),
  )

  const history = await withTenantContext(ctx(), (tx) =>
    getContactLeadHistoryCore(tx, { agencyId, contactId: contact.id }),
  )
  assert.equal(history.length, 1)
  assert.equal(history[0]!.id, leadId.id)
})

test("getContactLeadHistoryCore : contactId inconnu → tableau vide, jamais une exception", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const history = await withTenantContext(ctx(), (tx) =>
    getContactLeadHistoryCore(tx, { agencyId, contactId: randomUUID() }),
  )
  assert.deepEqual(history, [])
})

test("getContactLeadHistoryCore : canal sans champ équivalent sur leads (ex. 'web') → tableau vide, jamais une valeur fabriquée", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())

  const [webContact] = await withTenantContext(ctx(), (tx) =>
    tx
      .insert(contacts)
      .values({ agencyId, channel: "web", contactRef: "anonymous-session-123" })
      .returning(),
  )

  const history = await withTenantContext(ctx(), (tx) =>
    getContactLeadHistoryCore(tx, { agencyId, contactId: webContact!.id }),
  )
  assert.deepEqual(history, [])
})

test("getContactLeadHistoryCore : isolation — un lead d'un autre contact n'apparaît jamais", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const emailA = "contact-history-isolation-a@example.test"
  const emailB = "contact-history-isolation-b@example.test"

  await withTenantContext(ctx(), (tx) =>
    createLeadCore(tx, {
      agencyId,
      firstName: "A",
      email: emailA,
      productType: "general",
      sourcePage: "web",
    }),
  )
  const leadB = await withTenantContext(ctx(), (tx) =>
    createLeadCore(tx, {
      agencyId,
      firstName: "B",
      email: emailB,
      productType: "general",
      sourcePage: "web",
    }),
  )
  const contactB = await withTenantContext(ctx(), (tx) =>
    resolveOrCreateContactCore(tx, {
      agencyId,
      channel: "email",
      rawRef: emailB,
    }),
  )

  const history = await withTenantContext(ctx(), (tx) =>
    getContactLeadHistoryCore(tx, { agencyId, contactId: contactB.id }),
  )
  assert.equal(history.length, 1)
  assert.equal(history[0]!.id, leadB.id)
})
