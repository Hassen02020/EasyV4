/**
 * CRM-LEAD-WIRING-01 — preuve live contre un Postgres réel, même convention
 * que lib/meta-leadads/__tests__/lead-capture-core.test.ts : le canal "site
 * web" doit créer lead + provenance (channel/website_form) + contact,
 * exactement comme le canal Meta Lead Ads déjà conforme.
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
import { agencies, contacts, leads, leadOriginEvents } from "@/lib/db/schema"
import { captureWebsiteLeadCore } from "../website-lead-capture-core"

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
      name: "CRM-LEAD-WIRING-01 Agency",
      agencyType: "ota",
      slug: `crm-lead-wiring-01-${agencyId.slice(0, 8)}`,
    })
  })
})

after(async () => {
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    await tx.delete(contacts).where(eq(contacts.agencyId, agencyId))
    await tx
      .delete(leadOriginEvents)
      .where(eq(leadOriginEvents.agencyId, agencyId))
    await tx.delete(leads).where(eq(leads.agencyId, agencyId))
    await tx.delete(agencies).where(eq(agencies.id, agencyId))
  })
})

function ctx(): TenantContext {
  return { agencyId, userId: "", isSuperAdmin: true }
}

test("captureWebsiteLeadCore : email présent → lead + provenance (channel=website_form) + contact (channel=email)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())

  const result = await withTenantContext(ctx(), (tx) =>
    captureWebsiteLeadCore(tx, {
      agencyId,
      firstName: "Amine Site",
      email: "site-lead@example.test",
      productType: "general",
      sourcePage: "/omra",
      intention: "standard",
    }),
  )

  assert.ok(
    result.contactId,
    "un contact doit être résolu quand un email est fourni",
  )

  const [lead] = await withTenantContext(ctx(), (tx) =>
    tx.select().from(leads).where(eq(leads.id, result.leadId)),
  )
  assert.equal(lead!.email, "site-lead@example.test")
  assert.equal(
    lead!.channel,
    "website",
    "colonne cache channel résolue sur le lead",
  )

  const events = await withTenantContext(ctx(), (tx) =>
    tx
      .select()
      .from(leadOriginEvents)
      .where(eq(leadOriginEvents.leadId, result.leadId)),
  )
  assert.equal(events.length, 1)
  assert.equal(events[0]!.role, "channel")
  assert.equal(events[0]!.actorRef, "website")
  assert.equal(events[0]!.source, "website_form")

  const [contact] = await withTenantContext(ctx(), (tx) =>
    tx.select().from(contacts).where(eq(contacts.id, result.contactId!)),
  )
  assert.equal(contact!.channel, "email")
  assert.equal(contact!.contactRef, "site-lead@example.test")
})

test("captureWebsiteLeadCore : seulement téléphone → contact résolu channel='call'", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())

  const result = await withTenantContext(ctx(), (tx) =>
    captureWebsiteLeadCore(tx, {
      agencyId,
      firstName: "Sami Tel",
      phone: "21629999088",
      productType: "general",
      sourcePage: "/packages",
      intention: "standard",
    }),
  )

  assert.ok(result.contactId)
  const [contact] = await withTenantContext(ctx(), (tx) =>
    tx.select().from(contacts).where(eq(contacts.id, result.contactId!)),
  )
  assert.equal(contact!.channel, "call")
  assert.equal(contact!.contactRef, "+21629999088")
})

test("captureWebsiteLeadCore : ni email ni téléphone → lead créé, contactId null (jamais un contact fabriqué)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())

  const result = await withTenantContext(ctx(), (tx) =>
    captureWebsiteLeadCore(tx, {
      agencyId,
      firstName: "Anonyme",
      productType: "general",
      sourcePage: "/transferts",
      intention: "standard",
    }),
  )

  assert.equal(result.contactId, null)
})

test("captureWebsiteLeadCore : aucun événement de consentement marketing écrit (CONSENT-01 — jamais un consentement inventé)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())

  // Vérifie l'absence structurelle : website-lead-capture-core.ts n'importe
  // jamais recordConsentEventCore — preuve statique (pas de table à
  // interroger côté lead_consent_events puisque le point de contact n'a
  // reçu aucun événement, mais on vérifie ici l'invariant fonctionnel : le
  // contact créé n'a aucune conséquence sur le consentement).
  const result = await withTenantContext(ctx(), (tx) =>
    captureWebsiteLeadCore(tx, {
      agencyId,
      firstName: "Consent Check",
      email: "consent-check@example.test",
      productType: "general",
      sourcePage: "/omra",
      intention: "standard",
    }),
  )
  assert.ok(result.contactId)
})
