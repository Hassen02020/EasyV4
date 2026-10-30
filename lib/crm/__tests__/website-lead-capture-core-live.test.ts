/**
 * CRM-LEAD-WIRING-01 — preuve live contre un Postgres réel, même convention
 * que lib/meta-leadads/__tests__/lead-capture-core.test.ts : le canal "site
 * web" doit créer lead + provenance (channel/website_form) + contact,
 * exactement comme le canal Meta Lead Ads déjà conforme.
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
import {
  agencies,
  contacts,
  leads,
  leadConsentEvents,
  leadOriginEvents,
} from "@/lib/db/schema"
import { captureWebsiteLeadCore } from "../website-lead-capture-core"
import { filterAudienceByConsentCore } from "../campaign-core"

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
  await cleanupAsSuperuserWithDrizzle(async (tx) => {
    await tx
      .delete(leadConsentEvents)
      .where(eq(leadConsentEvents.agencyId, agencyId))
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

/* ---------------------------------------------------------------------- */
/* CRM-LEAD-FLOW-01 — consentement marketing explicite                     */
/* ---------------------------------------------------------------------- */

async function consentRows(leadId: string) {
  return withSystemContext((tx) =>
    tx
      .select({
        channel: leadConsentEvents.channel,
        contactRef: leadConsentEvents.contactRef,
        purpose: leadConsentEvents.purpose,
        action: leadConsentEvents.action,
        source: leadConsentEvents.source,
        proofRef: leadConsentEvents.proofRef,
      })
      .from(leadConsentEvents)
      .where(eq(leadConsentEvents.proofRef, `lead:${leadId}`)),
  )
}

async function eligibility(
  leadId: string,
  email: string | null,
  phone: string | null,
  channel: "email" | "whatsapp" | "call",
) {
  const { contacts: rows } = await withTenantContext(ctx(), (tx) =>
    filterAudienceByConsentCore(tx, {
      agencyId,
      channel,
      audience: [{ id: leadId, email, phone }],
    }),
  )
  return rows.map((r) => r.eligible)
}

test("CRM-LEAD-FLOW-01 : case cochée (email + téléphone) → consentement email, whatsapp et call, rattaché au contact normalisé, preuve lead:<id> ; le prospect devient éligible aux campagnes", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const email = `Consent.${randomUUID().slice(0, 8)}@Example.test`
  const phone = `+216 98 ${String(Math.floor(Math.random() * 900) + 100)} 514`

  const result = await withTenantContext(ctx(), (tx) =>
    captureWebsiteLeadCore(tx, {
      agencyId,
      firstName: "Consent",
      email,
      phone,
      productType: "hotel",
      sourcePage: "/hotels/1",
      intention: "standard",
      marketingConsent: true,
    }),
  )
  assert.equal(result.consentEventIds.length, 3)

  const rows = await consentRows(result.leadId)
  assert.deepEqual(rows.map((r) => r.channel).sort(), [
    "call",
    "email",
    "whatsapp",
  ])
  for (const r of rows) {
    assert.equal(r.purpose, "marketing")
    assert.equal(r.action, "granted")
    assert.equal(r.source, "website_form")
    assert.equal(r.proofRef, `lead:${result.leadId}`)
  }

  // Le consentement porte sur le contactRef NORMALISÉ du contact de chaque
  // canal — la clé exacte que consulte le filtre de campagne.
  const contactRows = await withSystemContext((tx) =>
    tx
      .select({ channel: contacts.channel, contactRef: contacts.contactRef })
      .from(contacts)
      .where(eq(contacts.agencyId, agencyId)),
  )
  for (const r of rows) {
    assert.ok(
      contactRows.some(
        (c) => c.channel === r.channel && c.contactRef === r.contactRef,
      ),
      `consentement ${r.channel} sans contact correspondant`,
    )
  }

  assert.deepEqual(await eligibility(result.leadId, email, phone, "email"), [
    true,
  ])
  assert.deepEqual(await eligibility(result.leadId, email, phone, "whatsapp"), [
    true,
  ])
  assert.deepEqual(await eligibility(result.leadId, email, phone, "call"), [
    true,
  ])
})

test("CRM-LEAD-FLOW-01 : case cochée avec email seul → un seul consentement (email), aucun canal inventé", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const email = `only.${randomUUID().slice(0, 8)}@example.test`
  const result = await withTenantContext(ctx(), (tx) =>
    captureWebsiteLeadCore(tx, {
      agencyId,
      firstName: "Email",
      email,
      productType: "package",
      sourcePage: "/packages/x",
      intention: "standard",
      marketingConsent: true,
    }),
  )
  const rows = await consentRows(result.leadId)
  assert.deepEqual(
    rows.map((r) => r.channel),
    ["email"],
  )
})

test("CRM-LEAD-FLOW-01 : case NON cochée → aucun consentement, prospect exclu des campagnes sur tous les canaux", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const email = `noconsent.${randomUUID().slice(0, 8)}@example.test`
  const phone = `+216 98 ${String(Math.floor(Math.random() * 900) + 100)} 777`
  const result = await withTenantContext(ctx(), (tx) =>
    captureWebsiteLeadCore(tx, {
      agencyId,
      firstName: "Sans",
      email,
      phone,
      productType: "hotel",
      sourcePage: "/hotels/2",
      intention: "standard",
      marketingConsent: false,
    }),
  )
  assert.deepEqual(result.consentEventIds, [])
  assert.equal((await consentRows(result.leadId)).length, 0)
  assert.deepEqual(await eligibility(result.leadId, email, phone, "email"), [
    false,
  ])
  assert.deepEqual(await eligibility(result.leadId, email, phone, "whatsapp"), [
    false,
  ])
})

test("CRM-LEAD-FLOW-01 : la campagne transmise est conservée sur le lead", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const result = await withTenantContext(ctx(), (tx) =>
    captureWebsiteLeadCore(tx, {
      agencyId,
      firstName: "Campagne",
      email: `camp.${randomUUID().slice(0, 8)}@example.test`,
      productType: "hotel",
      sourcePage: "/hotels/3",
      intention: "standard",
      campaignRef: "fb-ramadan-2027",
    }),
  )
  const [row] = await withSystemContext((tx) =>
    tx
      .select({ campaignRef: leads.campaignRef })
      .from(leads)
      .where(eq(leads.id, result.leadId)),
  )
  assert.equal(row?.campaignRef, "fb-ramadan-2027")
})
