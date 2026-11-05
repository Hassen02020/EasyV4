/**
 * CRM-META-CONNECT-01 (lot A) — route Page unifiée `/api/webhooks/meta-page`
 * exécutée pour de vrai (handler Next appelé avec une requête signée,
 * Postgres réel, app_runtime). Seuls sont simulés : la résolution de
 * l'agence par défaut (dépend du runtime Next), la notification (comptée)
 * et l'appel réseau Graph (fetch). Aucun appel Meta réel.
 *
 * Nécessite --experimental-test-module-mocks (job CI financial-e2e).
 */
import { cleanupAsSuperuserWithDrizzle } from "@/lib/db/test-helpers/superuser-cleanup"
import test, { before, after, mock } from "node:test"
import assert from "node:assert/strict"
import { createHmac, randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { NextRequest } from "next/server"
import { withSystemContext } from "@/lib/db/tenant-context"
import {
  agencies,
  auditEvents,
  contacts,
  crmConversations,
  crmMessages,
  leadOriginEvents,
  leads,
} from "@/lib/db/schema"

const APP_SECRET = "test-app-secret-meta-page"
const VERIFY_TOKEN = "test-verify-token-meta-page"

let dbAvailable = false
let agencyId = ""
const notified: { leadId: string; channel: string }[] = []
let graphResponse: () => Response = () => new Response("{}", { status: 500 })
const fetchCalls: { url: string; auth: string | null }[] = []

type RouteModule = typeof import("@/app/api/webhooks/meta-page/route")
let route: RouteModule
let legacy: {
  leadads: typeof import("@/app/api/webhooks/meta-leadads/route")
  messenger: typeof import("@/app/api/webhooks/messenger/route")
  instagram: typeof import("@/app/api/webhooks/instagram/route")
}

async function isDbAvailable() {
  try {
    await withSystemContext((tx) => tx.execute(sql`select 1`))
    return true
  } catch {
    return false
  }
}

before(async () => {
  dbAvailable = await isDbAvailable()
  if (!dbAvailable) return
  agencyId = randomUUID()
  await withSystemContext((tx) =>
    tx.insert(agencies).values({
      id: agencyId,
      slug: `meta-page-${agencyId.slice(0, 8)}`,
      name: "CRM-META-CONNECT-01 fixture",
      agencyType: "ota",
    }),
  )
  mock.module("@/lib/agencies/default-agency", {
    namedExports: { getDefaultAgencyId: async () => agencyId },
  })
  mock.module("@/lib/crm/lead-created-notify", {
    namedExports: {
      notifyLeadCreated: async (p: { leadId: string; channel: string }) =>
        void notified.push({ leadId: p.leadId, channel: p.channel }),
    },
  })
  mock.method(
    globalThis,
    "fetch",
    async (input: string | URL, init?: RequestInit) => {
      fetchCalls.push({
        url: String(input),
        auth: new Headers(init?.headers).get("authorization"),
      })
      return graphResponse()
    },
  )
  process.env.META_APP_SECRET = APP_SECRET
  process.env.META_PAGE_VERIFY_TOKEN = VERIFY_TOKEN
  process.env.META_PAGE_ACCESS_TOKEN = "test-page-token"
  route = await import("@/app/api/webhooks/meta-page/route")
  legacy = {
    leadads: await import("@/app/api/webhooks/meta-leadads/route"),
    messenger: await import("@/app/api/webhooks/messenger/route"),
    instagram: await import("@/app/api/webhooks/instagram/route"),
  }
})

after(async () => {
  if (!dbAvailable) return
  mock.restoreAll()
  await cleanupAsSuperuserWithDrizzle(async (tx) => {
    await tx.delete(auditEvents).where(eq(auditEvents.agencyId, agencyId))
    await tx.delete(crmMessages).where(eq(crmMessages.agencyId, agencyId))
    await tx
      .delete(crmConversations)
      .where(eq(crmConversations.agencyId, agencyId))
    await tx
      .delete(leadOriginEvents)
      .where(eq(leadOriginEvents.agencyId, agencyId))
    await tx.delete(contacts).where(eq(contacts.agencyId, agencyId))
    await tx.delete(leads).where(eq(leads.agencyId, agencyId))
    await tx.delete(agencies).where(eq(agencies.id, agencyId))
  })
})

const skip = () => "Postgres local indisponible (DATABASE_URL)."

function signedPost(body: unknown, secret = APP_SECRET) {
  const raw = JSON.stringify(body)
  const sig = createHmac("sha256", secret).update(raw).digest("hex")
  return new NextRequest("https://example.test/api/webhooks/meta-page", {
    method: "POST",
    body: raw,
    headers: { "x-hub-signature-256": `sha256=${sig}` },
  })
}

function pagePayload(opts: { psid: string; mid: string; leadgenId?: string }) {
  return {
    object: "page",
    entry: [
      {
        id: "PAGE",
        messaging: [
          {
            sender: { id: opts.psid },
            timestamp: 1793434800000,
            message: { mid: opts.mid, text: "Bonjour, un devis Omra ?" },
          },
          {
            sender: { id: "PAGE" },
            timestamp: 1793434800000,
            message: {
              mid: `${opts.mid}.echo`,
              text: "Réponse",
              is_echo: true,
            },
          },
        ],
        changes: opts.leadgenId
          ? [{ field: "leadgen", value: { leadgen_id: opts.leadgenId } }]
          : [],
      },
    ],
  }
}

const graphLead = (leadgenId: string) => () =>
  new Response(
    JSON.stringify({
      id: leadgenId,
      created_time: "2026-10-31T18:00:00+0000",
      field_data: [
        { name: "full_name", values: ["Amira Test"] },
        { name: "email", values: ["amira.test@example.test"] },
      ],
    }),
    { status: 200 },
  )

async function count(table: "leads" | "conversations" | "messages") {
  const rows = await withSystemContext((tx) =>
    table === "leads"
      ? tx
          .select({ id: leads.id })
          .from(leads)
          .where(eq(leads.agencyId, agencyId))
      : table === "conversations"
        ? tx
            .select({ id: crmConversations.id })
            .from(crmConversations)
            .where(eq(crmConversations.agencyId, agencyId))
        : tx
            .select({ id: crmMessages.id })
            .from(crmMessages)
            .where(eq(crmMessages.agencyId, agencyId)),
  )
  return rows.length
}

test("GET handshake : bon jeton → challenge ; mauvais jeton → 403", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const ok = await route.GET(
    new NextRequest(
      `https://example.test/api/webhooks/meta-page?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=4242`,
    ),
  )
  assert.equal(ok.status, 200)
  assert.equal(await ok.text(), "4242")
  const ko = await route.GET(
    new NextRequest(
      "https://example.test/api/webhooks/meta-page?hub.mode=subscribe&hub.verify_token=faux&hub.challenge=4242",
    ),
  )
  assert.equal(ko.status, 403)
})

test("signature invalide → 400 et rien n'est écrit", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const before = await count("conversations")
  const res = await route.POST(
    signedPost(pagePayload({ psid: "PSID-X", mid: "m.x" }), "mauvais-secret"),
  )
  assert.equal(res.status, 400)
  assert.equal(await count("conversations"), before)
})

test("un envoi Page avec leadgen + messages : les DEUX sont traités ; écho ignoré ; rejeu sans doublon", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const leadgenId = `lg_${randomUUID()}`
  const psid = `PSID-${randomUUID().slice(0, 8)}`
  const payload = pagePayload({ psid, mid: `m.${randomUUID()}`, leadgenId })
  graphResponse = graphLead(leadgenId)

  const res = await route.POST(signedPost(payload))
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), {
    ok: true,
    messages: 1,
    leads: 1,
    ignored: 0,
  })

  const [conv] = await withSystemContext((tx) =>
    tx
      .select()
      .from(crmConversations)
      .where(eq(crmConversations.contactExternalId, psid)),
  )
  assert.equal(conv!.channel, "messenger")
  assert.equal(conv!.contactPhone, null)
  const [lead] = await withSystemContext((tx) =>
    tx
      .select()
      .from(leads)
      .where(eq(leads.sourcePage, `meta_leadads:${leadgenId}`)),
  )
  assert.equal(lead!.firstName, "Amira Test")
  assert.equal(
    await count("messages"),
    1,
    "l'écho de la Page n'est pas enregistré",
  )
  assert.deepEqual(notified.map((n) => n.channel).sort(), [
    "messenger",
    "meta_lead_ads",
  ])

  // Rejeu du même envoi (relivraison Meta) : aucune ligne, aucune notification.
  const counts = [await count("leads"), await count("messages")]
  const replay = await route.POST(signedPost(payload))
  assert.equal(replay.status, 200)
  assert.deepEqual([await count("leads"), await count("messages")], counts)
  assert.equal(notified.length, 2)
})

test("échec Graph sur un leadgen → 500 (Meta relivre) + trace sans donnée personnelle ; le message du même envoi est conservé", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const leadgenId = `lg_${randomUUID()}`
  graphResponse = () => new Response("{}", { status: 500 })
  const psid = `PSID-${randomUUID().slice(0, 8)}`
  const res = await route.POST(
    signedPost(
      pagePayload({
        psid,
        mid: `m.${randomUUID()}`,
        leadgenId,
      }),
    ),
  )
  assert.equal(res.status, 500)
  const [conv] = await withSystemContext((tx) =>
    tx
      .select({ id: crmConversations.id })
      .from(crmConversations)
      .where(eq(crmConversations.contactExternalId, psid)),
  )
  assert.ok(
    conv,
    "le message Messenger du même envoi est enregistré malgré l'échec Lead Ads",
  )
  const traces = await withSystemContext((tx) =>
    tx
      .select({ diff: auditEvents.diff, entityId: auditEvents.entityId })
      .from(auditEvents)
      .where(eq(auditEvents.entityId, leadgenId)),
  )
  assert.deepEqual(traces, [
    {
      entityId: leadgenId,
      diff: { code: "META_LEADADS_FETCH_FAILED", graph: { status: 500 } },
    },
  ])
})

test("objet autre que « page » → ignoré (200), rien n'est écrit", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const before = await count("conversations")
  const res = await route.POST(signedPost({ object: "instagram", entry: [] }))
  assert.equal(res.status, 200)
  assert.equal(await count("conversations"), before)
})

const notifiedFor = (leadId: string) =>
  notified.filter((n) => n.leadId === leadId).length

async function messagesOf(externalId: string) {
  const [conv] = await withSystemContext((tx) =>
    tx
      .select({ id: crmConversations.id, leadId: crmConversations.leadId })
      .from(crmConversations)
      .where(eq(crmConversations.contactExternalId, externalId)),
  )
  if (!conv) return { conv: null, messages: 0 }
  const msgs = await withSystemContext((tx) =>
    tx
      .select({ id: crmMessages.id })
      .from(crmMessages)
      .where(eq(crmMessages.conversationId, conv.id)),
  )
  return { conv, messages: msgs.length }
}

test("indépendance (1/2) : un message Messenger qui échoue en base n'empêche pas le lead Lead Ads du même envoi", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const leadgenId = `lg_${randomUUID()}`
  graphResponse = graphLead(leadgenId)
  // Identifiant de 200 caractères > varchar(128) : échec RÉEL d'écriture.
  const badPsid = "P".repeat(200)
  const res = await route.POST(
    signedPost(
      pagePayload({ psid: badPsid, mid: `m.${randomUUID()}`, leadgenId }),
    ),
  )
  // Comportement documenté : un message en échec est journalisé, la réponse
  // reste 200 (pas de relivraison Meta pour un message) — voir rapport.
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), {
    ok: true,
    messages: 0,
    leads: 1,
    ignored: 0,
  })
  const [lead] = await withSystemContext((tx) =>
    tx
      .select({ id: leads.id })
      .from(leads)
      .where(eq(leads.sourcePage, `meta_leadads:${leadgenId}`)),
  )
  assert.ok(lead, "le lead Lead Ads est enregistré malgré l'échec du message")
})

test("renvoi Meta après un 500 : le lead manquant est créé une fois, le message n'est ni dupliqué ni re-notifié", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const leadgenId = `lg_${randomUUID()}`
  const psid = `PSID-${randomUUID().slice(0, 8)}`
  const payload = pagePayload({ psid, mid: `m.${randomUUID()}`, leadgenId })

  // 1re livraison : Graph en panne → 500, message enregistré + notifié.
  graphResponse = () => new Response("{}", { status: 500 })
  assert.equal((await route.POST(signedPost(payload))).status, 500)
  const first = await messagesOf(psid)
  assert.equal(first.messages, 1)
  assert.equal(notifiedFor(first.conv!.leadId!), 1)

  // Relivraison Meta (même envoi) : Graph répond → 200.
  graphResponse = graphLead(leadgenId)
  const second = await route.POST(signedPost(payload))
  assert.equal(second.status, 200)
  assert.deepEqual(await second.json(), {
    ok: true,
    messages: 1,
    leads: 1,
    ignored: 0,
  })

  const after = await messagesOf(psid)
  assert.equal(after.messages, 1, "message non dupliqué (idempotence mid)")
  assert.equal(
    notifiedFor(first.conv!.leadId!),
    1,
    "pas de 2e notification Messenger",
  )
  const metaLeads = await withSystemContext((tx) =>
    tx
      .select({ id: leads.id })
      .from(leads)
      .where(eq(leads.sourcePage, `meta_leadads:${leadgenId}`)),
  )
  assert.equal(metaLeads.length, 1)
  assert.equal(notifiedFor(metaLeads[0]!.id), 1)

  // 3e livraison identique : plus rien ne change.
  const third = await route.POST(signedPost(payload))
  assert.equal(third.status, 200)
  assert.equal((await messagesOf(psid)).messages, 1)
  assert.equal(notifiedFor(metaLeads[0]!.id), 1)
})

test("anciennes routes : /meta-leadads, /messenger et /instagram fonctionnent toujours (même code partagé)", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  // /meta-leadads
  const leadgenId = `lg_${randomUUID()}`
  graphResponse = graphLead(leadgenId)
  const la = await legacy.leadads.POST(
    signedPost({
      object: "page",
      entry: [
        { changes: [{ field: "leadgen", value: { leadgen_id: leadgenId } }] },
      ],
    }),
  )
  assert.equal(la.status, 200)
  assert.deepEqual(await la.json(), { ok: true, processed: 1, ignored: 0 })

  // /messenger
  const psid = `PSID-${randomUUID().slice(0, 8)}`
  const ms = await legacy.messenger.POST(
    signedPost(pagePayload({ psid, mid: `m.${randomUUID()}` })),
  )
  assert.equal(ms.status, 200)
  assert.deepEqual(await ms.json(), { ok: true, processed: 1 })
  assert.equal((await messagesOf(psid)).messages, 1)

  // /instagram
  const igsid = `IG-${randomUUID().slice(0, 8)}`
  const ig = await legacy.instagram.POST(
    signedPost({
      object: "instagram",
      entry: [
        {
          messaging: [
            {
              sender: { id: igsid },
              timestamp: 1793434800000,
              message: { mid: `ig.${randomUUID()}`, text: "Salut" },
            },
          ],
        },
      ],
    }),
  )
  assert.equal(ig.status, 200)
  const igConv = await messagesOf(igsid)
  assert.equal(igConv.messages, 1)

  // Signature invalide refusée sur chacune.
  for (const r of [legacy.leadads, legacy.messenger, legacy.instagram]) {
    const bad = await r.POST(signedPost({ object: "page", entry: [] }, "faux"))
    assert.equal(bad.status, 400)
  }
})

// ─── META-CRM-E2E-01 (lot 2) ────────────────────────────────────────────

async function auditFor(leadgenId: string) {
  return withSystemContext((tx) =>
    tx
      .select({ action: auditEvents.action, diff: auditEvents.diff })
      .from(auditEvents)
      .where(eq(auditEvents.entityId, leadgenId)),
  )
}

function leadgenPayload(
  leadgenId: string,
  opts: { pageId?: string; formId?: string; psid?: string } = {},
) {
  return {
    object: "page",
    entry: [
      {
        id: opts.pageId ?? "PAGE",
        messaging: opts.psid
          ? [
              {
                sender: { id: opts.psid },
                timestamp: 1793434800000,
                message: { mid: `m.${randomUUID()}`, text: "Bonjour" },
              },
            ]
          : [],
        changes: [
          {
            field: "leadgen",
            value: {
              leadgen_id: leadgenId,
              page_id: opts.pageId ?? "PAGE",
              form_id: opts.formId ?? "FORM-1",
            },
          },
        ],
      },
    ],
  }
}

test("E4 : META_PAGE_VERIFY_TOKEN absent → GET 503 ; META_APP_SECRET absent → POST 503, rien n'est écrit", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const token = process.env.META_PAGE_VERIFY_TOKEN
  const secret = process.env.META_APP_SECRET
  try {
    delete process.env.META_PAGE_VERIFY_TOKEN
    const get = await route.GET(
      new NextRequest(
        `https://example.test/api/webhooks/meta-page?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=1`,
      ),
    )
    assert.equal(get.status, 503)

    delete process.env.META_APP_SECRET
    const before = [await count("leads"), await count("conversations")]
    const post = await route.POST(
      signedPost(leadgenPayload(`lg_${randomUUID()}`, { psid: "PSID-E4" })),
    )
    assert.equal(post.status, 503)
    assert.deepEqual(
      [await count("leads"), await count("conversations")],
      before,
    )
  } finally {
    process.env.META_PAGE_VERIFY_TOKEN = token
    process.env.META_APP_SECRET = secret
  }
})

test("P1-1 : envoi de test Meta (444444444444) → 200, tracé « ignoré », aucun appel Graph, aucun 500", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const callsBefore = fetchCalls.length
  const leadsBefore = await count("leads")
  const res = await route.POST(signedPost(leadgenPayload("444444444444")))
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), {
    ok: true,
    messages: 0,
    leads: 0,
    ignored: 1,
  })
  assert.equal(fetchCalls.length, callsBefore, "aucun appel Graph")
  assert.equal(await count("leads"), leadsBefore)
  const traces = (await auditFor("444444444444")).filter((r) =>
    String(r.action).startsWith("meta_leadads."),
  )
  assert.ok(traces.length >= 1)
  for (const r of traces) {
    assert.equal(r.action, "meta_leadads.ignored")
    assert.equal((r.diff as { reason: string }).reason, "meta_sample")
  }
  // La route historique applique la même règle.
  const legacyRes = await legacy.leadads.POST(
    signedPost(leadgenPayload("444444444444")),
  )
  assert.equal(legacyRes.status, 200)
})

test("P1-2 + P2-1 : échec Graph → trace avec code/sous-code/type/trace Meta, jamais le message ni le jeton ; jeton en en-tête, pas dans l'URL", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const leadgenId = `lg_${randomUUID()}`
  graphResponse = () =>
    new Response(
      JSON.stringify({
        error: {
          message:
            "Unsupported get request. Object with ID 'x' does not exist (token test-page-token)",
          type: "GraphMethodException",
          code: 100,
          error_subcode: 33,
          fbtrace_id: "AbC123_xyz",
        },
      }),
      { status: 400 },
    )
  const res = await route.POST(signedPost(leadgenPayload(leadgenId)))
  assert.equal(res.status, 500, "un vrai échec garde le 500 (Meta relivre)")
  const [trace] = await auditFor(leadgenId)
  assert.deepEqual(trace!.diff, {
    code: "META_LEADADS_FETCH_FAILED",
    graph: {
      status: 400,
      code: 100,
      subcode: 33,
      type: "GraphMethodException",
      fbtraceId: "AbC123_xyz",
    },
  })
  assert.doesNotMatch(
    JSON.stringify(trace),
    /test-page-token|Unsupported|does not exist/,
  )
  const call = fetchCalls.at(-1)!
  assert.doesNotMatch(call.url, /access_token|test-page-token/)
  assert.match(call.url, /fields=id,created_time,field_data/)
  assert.equal(call.auth, "Bearer test-page-token")
})

test("P1-3 + P2-2 : META_PAGE_ID configurée → autre Page ignorée (lead et message) ; bonne Page traitée avec page_id/form_id tracés", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  process.env.META_PAGE_ID = "177977315574057"
  try {
    const foreignLead = `lg_${randomUUID()}`
    const foreignPsid = `PSID-${randomUUID().slice(0, 8)}`
    const callsBefore = fetchCalls.length
    const res = await route.POST(
      signedPost(
        leadgenPayload(foreignLead, { pageId: "999", psid: foreignPsid }),
      ),
    )
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), {
      ok: true,
      messages: 0,
      leads: 0,
      ignored: 1,
    })
    assert.equal(fetchCalls.length, callsBefore)
    assert.equal(
      (await auditFor(foreignLead))[0]?.action,
      "meta_leadads.ignored",
    )
    assert.deepEqual(await messagesOf(foreignPsid), {
      conv: null,
      messages: 0,
    })

    const goodLead = `lg_${randomUUID()}`
    const goodPsid = `PSID-${randomUUID().slice(0, 8)}`
    graphResponse = graphLead(goodLead)
    const ok = await route.POST(
      signedPost(
        leadgenPayload(goodLead, {
          pageId: "177977315574057",
          formId: "FORM-NOV",
          psid: goodPsid,
        }),
      ),
    )
    assert.equal(ok.status, 200)
    assert.deepEqual(await ok.json(), {
      ok: true,
      messages: 1,
      leads: 1,
      ignored: 0,
    })
    const [lead] = await withSystemContext((tx) =>
      tx
        .select({ id: leads.id })
        .from(leads)
        .where(eq(leads.sourcePage, `meta_leadads:${goodLead}`)),
    )
    const origins = await withSystemContext((tx) =>
      tx
        .select({ notes: leadOriginEvents.notes })
        .from(leadOriginEvents)
        .where(eq(leadOriginEvents.leadId, lead!.id)),
    )
    assert.deepEqual(
      origins.map((o) => o.notes),
      ["page_id=177977315574057; form_id=FORM-NOV"],
    )
  } finally {
    delete process.env.META_PAGE_ID
  }
})
