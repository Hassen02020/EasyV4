/**
 * CRM-DASHBOARD-BLOCK-01 — preuve live (Postgres réel, app_runtime, RLS
 * forcée) des 6 compteurs CRM de l'accueil admin. Se dégrade en `skip`
 * sans base locale. Les données d'une autre agence ne doivent jamais compter.
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { withSystemContext, withTenantContext } from "@/lib/db/tenant-context"
import { cleanupAsSuperuserWithDrizzle } from "@/lib/db/test-helpers/superuser-cleanup"
import {
  agencies,
  campaignTargets,
  campaigns,
  contacts,
  leadConsentEvents,
  leads,
} from "@/lib/db/schema"
import { crmDashboardCore } from "../crm-dashboard-core"

const NOW = new Date("2026-10-30T12:00:00Z")
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000)

async function isDbAvailable(): Promise<boolean> {
  try {
    await withSystemContext((tx) => tx.execute(sql`select 1`))
    return true
  } catch {
    return false
  }
}

let dbAvailable = false
const ids = { a: "", b: "" }

async function seed(agencyId: string) {
  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values({
      id: agencyId,
      slug: `crm-dash-${agencyId.slice(0, 8)}`,
      name: "CRM-DASHBOARD-BLOCK-01 fixture",
      agencyType: "ota",
    })
    const lead = (status: string, createdAt: Date, convertedAt?: Date) => ({
      agencyId,
      firstName: "Test",
      sourcePage: "/landing/omra",
      status,
      createdAt,
      convertedAt: convertedAt ?? null,
    })
    await tx.insert(leads).values([
      lead("new", daysAgo(2)), // reçue 7 j + à traiter
      lead("new", daysAgo(20)), // à traiter seulement
      lead("contacted", daysAgo(3)), // reçue 7 j
      lead("converted", daysAgo(25), daysAgo(10)), // convertie 30 j
      lead("converted", daysAgo(90), daysAgo(60)), // convertie trop tôt
    ])
    const [contact] = await tx
      .insert(contacts)
      .values({
        agencyId,
        channel: "email",
        contactRef: `a-${agencyId}@x.test`,
      })
      .returning({ id: contacts.id })
    const [active] = await tx
      .insert(campaigns)
      .values({ agencyId, name: "Active", channel: "email", status: "active" })
      .returning({ id: campaigns.id })
    await tx
      .insert(campaigns)
      .values({
        agencyId,
        name: "Annulée",
        channel: "email",
        status: "cancelled",
      })
    await tx.insert(campaignTargets).values({
      campaignId: active.id,
      agencyId,
      contactId: contact.id,
      leadIds: [],
      consentStatusAtSnapshot: true,
      deliveryStatus: "sent",
      deliveredAt: daysAgo(1),
    })
    await tx.insert(leadConsentEvents).values([
      {
        agencyId,
        channel: "email",
        contactRef: `a-${agencyId}@x.test`,
        purpose: "marketing",
        action: "withdrawn",
        source: "campaign_unsubscribe",
        occurredAt: daysAgo(1),
      },
      {
        agencyId,
        channel: "email",
        contactRef: `b-${agencyId}@x.test`,
        purpose: "marketing",
        action: "granted",
        source: "test",
        occurredAt: daysAgo(1),
      },
    ])
  })
}

before(async () => {
  dbAvailable = await isDbAvailable()
  if (!dbAvailable) return
  ids.a = randomUUID()
  ids.b = randomUUID()
  await seed(ids.a)
  await seed(ids.b) // autre agence : mêmes données, ne doivent pas s'additionner
})

after(async () => {
  if (!dbAvailable) return
  await cleanupAsSuperuserWithDrizzle(async (tx) => {
    for (const agencyId of [ids.a, ids.b]) {
      await tx
        .delete(campaignTargets)
        .where(eq(campaignTargets.agencyId, agencyId))
      await tx.delete(campaigns).where(eq(campaigns.agencyId, agencyId))
      await tx
        .delete(leadConsentEvents)
        .where(eq(leadConsentEvents.agencyId, agencyId))
      await tx.delete(contacts).where(eq(contacts.agencyId, agencyId))
      await tx.delete(leads).where(eq(leads.agencyId, agencyId))
      await tx.delete(agencies).where(eq(agencies.id, agencyId))
    }
  })
})

test("6 compteurs CRM exacts, fenêtres 7 j / 30 j, isolés par agence (RLS)", async (t) => {
  if (!dbAvailable)
    return void t.skip("Postgres local indisponible (DATABASE_URL).")
  const stats = await withTenantContext(
    { agencyId: ids.a, userId: "", isSuperAdmin: false },
    (tx) => crmDashboardCore(tx, { agencyId: ids.a, now: NOW }),
  )
  assert.deepEqual(stats, {
    newLeads7d: 2,
    leadsToHandle: 2,
    convertedLeads30d: 1,
    activeCampaigns: 1,
    campaignEmailsSent30d: 1,
    unsubscribes30d: 1,
  })
})
