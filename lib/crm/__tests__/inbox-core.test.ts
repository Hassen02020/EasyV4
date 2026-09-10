/**
 * CRM / Inbox omnicanal — moteur central. Suit les mêmes conventions DB
 * (before/after agence, isDbAvailable) que lead-relance-core.test.ts.
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { withTenantContext, withSystemContext, type TenantContext } from "@/lib/db/tenant-context"
import { agencies, crmConversations, crmMessages, leads } from "@/lib/db/schema"
import {
  canSendSessionMessage,
  isChannelConnected,
  listConversationsCore,
  getConversationWithMessagesCore,
  upsertConversationForInboundCore,
  appendOutboundMessageCore,
} from "../inbox-core"

test("canSendSessionMessage : dernier message entrant < 24h → true", () => {
  const now = new Date("2026-01-10T12:00:00Z")
  assert.equal(
    canSendSessionMessage({ lastInboundAt: new Date("2026-01-10T00:00:01Z") }, now),
    true,
  )
})

test("canSendSessionMessage : dernier message entrant > 24h → false", () => {
  const now = new Date("2026-01-10T12:00:00Z")
  assert.equal(
    canSendSessionMessage({ lastInboundAt: new Date("2026-01-08T00:00:00Z") }, now),
    false,
  )
})

test("canSendSessionMessage : jamais de message entrant → false", () => {
  assert.equal(canSendSessionMessage({ lastInboundAt: null }), false)
})

test("isChannelConnected : seul whatsapp est réellement branché", () => {
  assert.equal(isChannelConnected("whatsapp"), true)
  assert.equal(isChannelConnected("instagram"), false)
  assert.equal(isChannelConnected("messenger"), false)
  assert.equal(isChannelConnected("call"), false)
  assert.equal(isChannelConnected("email"), false)
  assert.equal(isChannelConnected("web"), false)
})

/* -------------------------------------------------------------------------- */
/* DB-backed                                                                  */
/* -------------------------------------------------------------------------- */

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

let agencyA = ""
let agencyB = ""

before(async () => {
  dbAvailable = await isDbAvailable()
  if (!dbAvailable) return
  agencyA = randomUUID()
  agencyB = randomUUID()
  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values([
      { id: agencyA, name: "INBOX Agency A", agencyType: "ota", slug: `inbox-a-${agencyA.slice(0, 8)}` },
      { id: agencyB, name: "INBOX Agency B", agencyType: "ota", slug: `inbox-b-${agencyB.slice(0, 8)}` },
    ])
  })
})

after(async () => {
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    await tx.delete(crmMessages).where(eq(crmMessages.agencyId, agencyA))
    await tx.delete(crmConversations).where(eq(crmConversations.agencyId, agencyA))
    await tx.delete(leads).where(eq(leads.agencyId, agencyA))
    await tx.delete(crmMessages).where(eq(crmMessages.agencyId, agencyB))
    await tx.delete(crmConversations).where(eq(crmConversations.agencyId, agencyB))
    await tx.delete(leads).where(eq(leads.agencyId, agencyB))
    await tx.delete(agencies).where(eq(agencies.id, agencyA))
    await tx.delete(agencies).where(eq(agencies.id, agencyB))
  })
})

function ctxFor(agencyId: string): TenantContext {
  return { agencyId, userId: "", isSuperAdmin: true }
}

test("upsertConversationForInboundCore : premier message → crée conversation + lead + message", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const phone = "21620000001"

  const result = await withTenantContext(ctxFor(agencyA), (tx) =>
    upsertConversationForInboundCore(tx, {
      agencyId: agencyA,
      channel: "whatsapp",
      contactPhone: phone,
      contactName: "Amine",
      body: "Bonjour, avez-vous des chambres pour le 20 ?",
      externalMessageId: `wamid.${randomUUID()}`,
      sentAt: new Date(),
    }),
  )
  assert.equal(result.messageInserted, true)

  const thread = await withTenantContext(ctxFor(agencyA), (tx) =>
    getConversationWithMessagesCore(tx, { agencyId: agencyA, conversationId: result.conversationId }),
  )
  assert.ok(thread)
  assert.equal(thread!.conversation.contactPhone, phone)
  assert.equal(thread!.conversation.contactName, "Amine")
  assert.ok(thread!.conversation.leadId, "un lead doit avoir été créé et lié")
  assert.equal(thread!.messages.length, 1)
  assert.equal(thread!.messages[0]!.direction, "inbound")

  const linkedLead = await withTenantContext(ctxFor(agencyA), (tx) =>
    tx.select().from(leads).where(eq(leads.id, thread!.conversation.leadId!)),
  )
  assert.equal(linkedLead[0]!.phone, phone)
  assert.equal(linkedLead[0]!.sourcePage, "whatsapp")
})

test("upsertConversationForInboundCore : second message du même contact → même conversation, pas de doublon de lead", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const phone = "21620000002"

  const first = await withTenantContext(ctxFor(agencyA), (tx) =>
    upsertConversationForInboundCore(tx, {
      agencyId: agencyA,
      channel: "whatsapp",
      contactPhone: phone,
      body: "Premier message",
      externalMessageId: `wamid.${randomUUID()}`,
      sentAt: new Date("2026-01-01T10:00:00Z"),
    }),
  )
  const second = await withTenantContext(ctxFor(agencyA), (tx) =>
    upsertConversationForInboundCore(tx, {
      agencyId: agencyA,
      channel: "whatsapp",
      contactPhone: phone,
      body: "Deuxième message",
      externalMessageId: `wamid.${randomUUID()}`,
      sentAt: new Date("2026-01-01T11:00:00Z"),
    }),
  )
  assert.equal(second.conversationId, first.conversationId)

  const thread = await withTenantContext(ctxFor(agencyA), (tx) =>
    getConversationWithMessagesCore(tx, { agencyId: agencyA, conversationId: first.conversationId }),
  )
  assert.equal(thread!.messages.length, 2)

  const leadRows = await withTenantContext(ctxFor(agencyA), (tx) =>
    tx.select().from(leads).where(eq(leads.phone, phone)),
  )
  assert.equal(leadRows.length, 1, "pas de lead dupliqué pour le même contact")
})

test("upsertConversationForInboundCore : redélivrance webhook (même externalMessageId) → jamais un message en double", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const phone = "21620000003"
  const wamid = `wamid.${randomUUID()}`

  const first = await withTenantContext(ctxFor(agencyA), (tx) =>
    upsertConversationForInboundCore(tx, {
      agencyId: agencyA,
      channel: "whatsapp",
      contactPhone: phone,
      body: "Message original",
      externalMessageId: wamid,
      sentAt: new Date(),
    }),
  )
  assert.equal(first.messageInserted, true)

  // Meta redélivre le même webhook (même wamid) — comportement réel documenté.
  const redelivered = await withTenantContext(ctxFor(agencyA), (tx) =>
    upsertConversationForInboundCore(tx, {
      agencyId: agencyA,
      channel: "whatsapp",
      contactPhone: phone,
      body: "Message original",
      externalMessageId: wamid,
      sentAt: new Date(),
    }),
  )
  assert.equal(redelivered.messageInserted, false)

  const thread = await withTenantContext(ctxFor(agencyA), (tx) =>
    getConversationWithMessagesCore(tx, { agencyId: agencyA, conversationId: first.conversationId }),
  )
  assert.equal(thread!.messages.length, 1)
})

test("upsertConversationForInboundCore : un lead existant (même téléphone) est lié, jamais dupliqué", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const phone = "21620000004"

  const [existingLead] = await withTenantContext(ctxFor(agencyA), (tx) =>
    tx
      .insert(leads)
      .values({
        agencyId: agencyA,
        firstName: "Sara",
        phone,
        productType: "general",
        sourcePage: "/omra/mon-voyage",
      })
      .returning({ id: leads.id }),
  )

  const result = await withTenantContext(ctxFor(agencyA), (tx) =>
    upsertConversationForInboundCore(tx, {
      agencyId: agencyA,
      channel: "whatsapp",
      contactPhone: phone,
      body: "Bonjour, je vous ai contacté via le site",
      externalMessageId: `wamid.${randomUUID()}`,
      sentAt: new Date(),
    }),
  )

  const thread = await withTenantContext(ctxFor(agencyA), (tx) =>
    getConversationWithMessagesCore(tx, { agencyId: agencyA, conversationId: result.conversationId }),
  )
  assert.equal(thread!.conversation.leadId, existingLead!.id)

  const leadRows = await withTenantContext(ctxFor(agencyA), (tx) =>
    tx.select().from(leads).where(eq(leads.phone, phone)),
  )
  assert.equal(leadRows.length, 1)
})

test("appendOutboundMessageCore : insère un message sortant sans jamais toucher lastInboundAt", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const phone = "21620000005"
  const inboundAt = new Date("2026-01-05T08:00:00Z")

  const { conversationId } = await withTenantContext(ctxFor(agencyA), (tx) =>
    upsertConversationForInboundCore(tx, {
      agencyId: agencyA,
      channel: "whatsapp",
      contactPhone: phone,
      body: "Question client",
      externalMessageId: `wamid.${randomUUID()}`,
      sentAt: inboundAt,
    }),
  )

  const staffUserId = randomUUID()
  await withTenantContext(ctxFor(agencyA), (tx) =>
    appendOutboundMessageCore(tx, {
      agencyId: agencyA,
      conversationId,
      body: "Réponse de l'agent",
      handledByUserId: staffUserId,
    }),
  )

  const thread = await withTenantContext(ctxFor(agencyA), (tx) =>
    getConversationWithMessagesCore(tx, { agencyId: agencyA, conversationId }),
  )
  assert.equal(thread!.messages.length, 2)
  const outbound = thread!.messages.find((m) => m.direction === "outbound")
  assert.ok(outbound)
  assert.equal(outbound!.handledByUserId, staffUserId)
  assert.equal(
    thread!.conversation.lastInboundAt?.getTime(),
    inboundAt.getTime(),
    "lastInboundAt reste celui du dernier message CLIENT, jamais mis à jour par une réponse staff",
  )
})

test("listConversationsCore : isolation stricte par agence", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())

  await withTenantContext(ctxFor(agencyA), (tx) =>
    upsertConversationForInboundCore(tx, {
      agencyId: agencyA,
      channel: "whatsapp",
      contactPhone: "21620000010",
      body: "Message agence A",
      externalMessageId: `wamid.${randomUUID()}`,
      sentAt: new Date(),
    }),
  )
  await withTenantContext(ctxFor(agencyB), (tx) =>
    upsertConversationForInboundCore(tx, {
      agencyId: agencyB,
      channel: "whatsapp",
      contactPhone: "21620000011",
      body: "Message agence B",
      externalMessageId: `wamid.${randomUUID()}`,
      sentAt: new Date(),
    }),
  )

  const listA = await withTenantContext(ctxFor(agencyA), (tx) => listConversationsCore(tx, { agencyId: agencyA }))
  const listB = await withTenantContext(ctxFor(agencyB), (tx) => listConversationsCore(tx, { agencyId: agencyB }))

  assert.ok(listA.every((c) => !listB.some((b) => b.id === c.id)))
  assert.ok(listA.some((c) => c.contactPhone === "21620000010"))
  assert.ok(!listA.some((c) => c.contactPhone === "21620000011"))
  assert.ok(listB.some((c) => c.contactPhone === "21620000011"))
})
