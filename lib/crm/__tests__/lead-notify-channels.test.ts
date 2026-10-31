/**
 * CRM-LEAD-NOTIFY-CHANNELS-01 (écart G-03) — l'email « nouveau lead » part
 * pour tous les canaux entrants, avec un texte adapté, et seulement à la
 * création réelle du lead.
 *
 * - textes par canal + repli « formulaire du site » (événements antérieurs) ;
 * - email : intro + canal échappés ;
 * - notifyLeadCreated (live, Postgres réel) : charge utile relue en base,
 *   id d'événement stable par lead, lead inconnu → aucun envoi, échec
 *   d'envoi → ne lève jamais ;
 * - câblage des 5 routes : émission conditionnée à la création ; la saisie
 *   par l'équipe n'émet toujours rien.
 */
import { cleanupAsSuperuserWithDrizzle } from "@/lib/db/test-helpers/superuser-cleanup"
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import { agencies, leads } from "@/lib/db/schema"
import {
  LEAD_NOTIFY_CHANNELS,
  leadChannelIntro,
  leadChannelLabel,
} from "../lead-notify-channel"
import { notifyLeadCreated } from "../lead-created-notify"
import { buildNewLeadEmailHtml } from "@/lib/inngest/functions/process-new-lead"

const src = (rel: string) => readFileSync(rel, "utf8")

test("chaque canal a son libellé et son texte ; sans canal = formulaire du site", () => {
  const intros = new Set(LEAD_NOTIFY_CHANNELS.map((c) => leadChannelIntro(c)))
  assert.equal(intros.size, LEAD_NOTIFY_CHANNELS.length)
  assert.match(leadChannelIntro("whatsapp"), /WhatsApp/)
  assert.match(leadChannelIntro("meta_lead_ads"), /publicités Facebook/)
  assert.equal(leadChannelIntro(undefined), leadChannelIntro("website_form"))
  assert.equal(leadChannelLabel(null), "Formulaire du site")
})

test("email : le texte suit le canal, jamais « formulaire de contact » pour WhatsApp", () => {
  const html = buildNewLeadEmailHtml({
    agencyName: "Agence",
    visitorName: "Amine",
    phone: "+21620000001",
    product: "Renseignement général",
    sourcePage: "whatsapp",
    adminUrl: "https://easy2book.tn/admin/support",
    channel: "whatsapp",
  })
  assert.match(html, /vous écrire sur WhatsApp/)
  assert.match(html, />Canal<\/td>[\s\S]*?>WhatsApp<\/td>/)
  assert.doesNotMatch(html, /formulaire de contact/)

  const legacy = buildNewLeadEmailHtml({
    agencyName: "Agence",
    visitorName: "Amine",
    product: "Hôtel",
    sourcePage: "/hotels",
    adminUrl: "https://easy2book.tn/admin/support",
  })
  assert.match(legacy, /formulaire de contact sur votre site/)
})

test("câblage : chaque canal entrant émet seulement à la création ; l'équipe n'émet pas", () => {
  for (const ch of ["whatsapp", "messenger", "instagram"]) {
    const route = src(`app/api/webhooks/${ch}/route.ts`)
    assert.match(
      route,
      new RegExp(
        `if \\(inbound\\.createdLeadId\\) \\{\\s*await notifyLeadCreated\\(\\{[\\s\\S]*?channel: "${ch}"`,
      ),
      ch,
    )
  }
  // Lead Ads (G-05) : la condition vit dans processLeadgenBatchCore.
  assert.match(
    src("lib/meta-leadads/webhook-batch.ts"),
    /if \(!captured\.alreadyProcessed\) \{\s*await deps\.notifyCreated\(captured\.leadId\)/,
  )
  assert.match(
    src("app/api/webhooks/meta-leadads/route.ts"),
    /notifyCreated: \(leadId\) =>\s*notifyLeadCreated\(\{ agencyId, leadId, channel: "meta_lead_ads" \}\)/,
  )
  assert.match(
    src("app/api/webhooks/resend-inbound/route.ts"),
    /await notifyLeadCreated\(\{[\s\S]*?channel: "email"/,
  )
  assert.match(src("app/actions/submit-lead.ts"), /channel: "website_form"/)
  for (const f of [
    "lib/crm/staff-lead-capture-core.ts",
    "lib/admin/leads-actions.ts",
  ]) {
    assert.doesNotMatch(src(f), /notifyLeadCreated|crm\/lead\.created/, f)
  }
})

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

before(async () => {
  dbAvailable = await isDbAvailable()
  if (!dbAvailable) return
  agencyId = randomUUID()
  await withSystemContext((tx) =>
    tx.insert(agencies).values({
      id: agencyId,
      slug: `lead-notify-${agencyId.slice(0, 8)}`,
      name: "CRM-LEAD-NOTIFY-CHANNELS-01 fixture",
      agencyType: "ota",
    }),
  )
})

after(async () => {
  if (!dbAvailable) return
  await cleanupAsSuperuserWithDrizzle(async (tx) => {
    await tx.delete(leads).where(eq(leads.agencyId, agencyId))
    await tx.delete(agencies).where(eq(agencies.id, agencyId))
  })
})

test("notifyLeadCreated : charge utile relue en base, id d'événement stable par lead", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const [lead] = await withSystemContext((tx) =>
    tx
      .insert(leads)
      .values({
        agencyId,
        firstName: "Amine",
        phone: "+21620000009",
        message: "Bonjour",
        sourcePage: "whatsapp",
      })
      .returning({ id: leads.id }),
  )
  const sent: { id: string; name: string; data: unknown }[] = []
  await notifyLeadCreated(
    { agencyId, leadId: lead!.id, channel: "whatsapp" },
    { send: async (e) => void sent.push(e) },
  )
  assert.equal(sent.length, 1)
  assert.equal(sent[0]!.name, "crm/lead.created")
  assert.equal(sent[0]!.id, `crm/lead.created:${lead!.id}`)
  assert.deepEqual(sent[0]!.data, {
    leadId: lead!.id,
    agencyId,
    channel: "whatsapp",
    firstName: "Amine",
    lastName: null,
    email: null,
    phone: "+21620000009",
    message: "Bonjour",
    productType: "general",
    productLabel: null,
    sourcePage: "whatsapp",
  })
})

test("notifyLeadCreated : lead inconnu → aucun envoi ; envoi en échec → ne lève jamais", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const sent: unknown[] = []
  await notifyLeadCreated(
    { agencyId, leadId: randomUUID(), channel: "email" },
    { send: async (e) => void sent.push(e) },
  )
  assert.equal(sent.length, 0)

  const [lead] = await withSystemContext((tx) =>
    tx
      .insert(leads)
      .values({ agencyId, firstName: "X", sourcePage: "email_inbound" })
      .returning({ id: leads.id }),
  )
  const recorded: unknown[] = []
  await notifyLeadCreated(
    { agencyId, leadId: lead!.id, channel: "email" },
    {
      send: async () => {
        throw new Error("inngest down")
      },
      sleep: async () => {},
      record: async (r) => void recorded.push(r),
    },
  )
  assert.equal(recorded.length, 1, "échec tracé, jamais levé")
})
