/**
 * CRM-SOCIAL-CODE-FIX-01 — email entrant (Resend) : provenance `email /
 * email_inbound` (plus jamais `website_form`), déduplication par `email_id`
 * (y compris deux livraisons simultanées), aucun consentement fabriqué.
 * Postgres réel (app_runtime, RLS forcée) ; `skip` sans base locale.
 */
import { cleanupAsSuperuserWithDrizzle } from "@/lib/db/test-helpers/superuser-cleanup"
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { withSystemContext, withTenantContext } from "@/lib/db/tenant-context"
import {
  agencies,
  contacts,
  leadConsentEvents,
  leadOriginEvents,
  leads,
} from "@/lib/db/schema"
import { captureInboundEmailLeadCore } from "../inbound-email-capture-core"
import { captureWebsiteLeadCore } from "../website-lead-capture-core"

async function isDbAvailable(): Promise<boolean> {
  try {
    await withSystemContext((tx) => tx.execute(sql`select 1`))
    return true
  } catch {
    return false
  }
}

let dbAvailable = false
let agencyId = ""
const skipReason = () => "Postgres local indisponible (DATABASE_URL)."

const capture = (emailId: string | null, email = "client@example.test") =>
  withTenantContext({ agencyId, userId: "", isSuperAdmin: true }, (tx) =>
    captureInboundEmailLeadCore(tx, {
      agencyId,
      firstName: "Client",
      email,
      message: "Demande de devis — Djerba 3 nuits",
      emailId,
    }),
  )

const leadsWithSource = async (sourcePage: string) =>
  withSystemContext((tx) =>
    tx
      .select({ id: leads.id })
      .from(leads)
      .where(eq(leads.sourcePage, sourcePage)),
  )

before(async () => {
  dbAvailable = await isDbAvailable()
  if (!dbAvailable) return
  agencyId = randomUUID()
  await withSystemContext((tx) =>
    tx.insert(agencies).values({
      id: agencyId,
      slug: `inbound-email-${agencyId.slice(0, 8)}`,
      name: "CRM-SOCIAL-CODE-FIX-01 fixture",
      agencyType: "ota",
    }),
  )
})

after(async () => {
  if (!dbAvailable) return
  await cleanupAsSuperuserWithDrizzle(async (tx) => {
    await tx
      .delete(leadConsentEvents)
      .where(eq(leadConsentEvents.agencyId, agencyId))
    await tx
      .delete(leadOriginEvents)
      .where(eq(leadOriginEvents.agencyId, agencyId))
    await tx.delete(contacts).where(eq(contacts.agencyId, agencyId))
    await tx.delete(leads).where(eq(leads.agencyId, agencyId))
    await tx.delete(agencies).where(eq(agencies.id, agencyId))
  })
})

test("provenance email / email_inbound (jamais website_form), contact email, aucun consentement", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const emailId = `re_${randomUUID()}`
  const r = await capture(emailId)
  assert.equal(r.alreadyProcessed, false)

  const origins = await withSystemContext((tx) =>
    tx
      .select({
        actorRef: leadOriginEvents.actorRef,
        source: leadOriginEvents.source,
      })
      .from(leadOriginEvents)
      .where(eq(leadOriginEvents.leadId, r.leadId)),
  )
  assert.deepEqual(origins, [{ actorRef: "email", source: "email_inbound" }])

  const [lead] = await withSystemContext((tx) =>
    tx.select().from(leads).where(eq(leads.id, r.leadId)),
  )
  assert.equal(lead!.sourcePage, `email_inbound:${emailId}`)

  const consents = await withSystemContext((tx) =>
    tx
      .select({ id: leadConsentEvents.id })
      .from(leadConsentEvents)
      .where(eq(leadConsentEvents.agencyId, agencyId)),
  )
  assert.equal(consents.length, 0)
})

test("même email_id relivré → même lead, alreadyProcessed (ni doublon ni seconde notification)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const emailId = `re_${randomUUID()}`
  const first = await capture(emailId)
  const second = await capture(emailId)
  assert.equal(second.alreadyProcessed, true)
  assert.equal(second.leadId, first.leadId)
  assert.equal((await leadsWithSource(`email_inbound:${emailId}`)).length, 1)
})

test("deux livraisons SIMULTANÉES du même email_id → un seul lead (verrou)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const emailId = `re_${randomUUID()}`
  const results = await Promise.all([
    capture(emailId),
    capture(emailId),
    capture(emailId),
  ])
  assert.equal(results.filter((r) => !r.alreadyProcessed).length, 1)
  assert.equal(new Set(results.map((r) => r.leadId)).size, 1)
  assert.equal((await leadsWithSource(`email_inbound:${emailId}`)).length, 1)
})

test("sans email_id → un lead par appel (comportement antérieur conservé)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const a = await capture(null, "sans-id@example.test")
  const b = await capture(null, "sans-id@example.test")
  assert.notEqual(a.leadId, b.leadId)
  assert.equal(b.alreadyProcessed, false)
})

test("site inchangé : sans origine explicite → website / website_form", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const r = await withTenantContext(
    { agencyId, userId: "", isSuperAdmin: true },
    (tx) =>
      captureWebsiteLeadCore(tx, {
        agencyId,
        firstName: "Visiteur",
        email: "visiteur@example.test",
        productType: "general",
        sourcePage: "/contact",
        intention: "standard",
      }),
  )
  const origins = await withSystemContext((tx) =>
    tx
      .select({
        actorRef: leadOriginEvents.actorRef,
        source: leadOriginEvents.source,
      })
      .from(leadOriginEvents)
      .where(eq(leadOriginEvents.leadId, r.leadId)),
  )
  assert.deepEqual(origins, [{ actorRef: "website", source: "website_form" }])
})
