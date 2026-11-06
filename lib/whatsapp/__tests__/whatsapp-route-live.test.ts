/**
 * WHATSAPP-CRM-01 (W-09) — route `/api/webhooks/whatsapp` exécutée pour de
 * vrai (handler Next appelé avec des requêtes signées, Postgres réel,
 * app_runtime). Simulés seulement : l'agence par défaut (runtime Next) et la
 * notification « nouveau prospect » (comptée). Aucun appel Meta.
 *
 * Nécessite --experimental-test-module-mocks (job CI financial-e2e).
 */
import { cleanupAsSuperuserWithDrizzle } from "@/lib/db/test-helpers/superuser-cleanup"
import test, { before, after, mock } from "node:test"
import assert from "node:assert/strict"
import { createHmac, randomUUID } from "node:crypto"
import { and, eq, sql } from "drizzle-orm"
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

const APP_SECRET = "test-app-secret-whatsapp"
const VERIFY_TOKEN = "test-verify-token-whatsapp"
const PNID = "PNID-EASY2BOOK"

let dbAvailable = false
let agencyId = ""
const notified: string[] = []

type RouteModule = typeof import("@/app/api/webhooks/whatsapp/route")
let route: RouteModule

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
      slug: `wa-route-${agencyId.slice(0, 8)}`,
      name: "WHATSAPP-CRM-01 fixture",
      agencyType: "ota",
    }),
  )
  mock.module("@/lib/agencies/default-agency", {
    namedExports: { getDefaultAgencyId: async () => agencyId },
  })
  mock.module("@/lib/crm/lead-created-notify", {
    namedExports: {
      notifyLeadCreated: async (p: { leadId: string }) =>
        void notified.push(p.leadId),
    },
  })
  process.env.WHATSAPP_APP_SECRET = APP_SECRET
  process.env.WHATSAPP_VERIFY_TOKEN = VERIFY_TOKEN
  route = await import("@/app/api/webhooks/whatsapp/route")
})

after(async () => {
  if (!dbAvailable) return
  mock.restoreAll()
  delete process.env.WHATSAPP_PHONE_NUMBER_ID
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
  return new NextRequest("https://example.test/api/webhooks/whatsapp", {
    method: "POST",
    body: raw,
    headers: { "x-hub-signature-256": `sha256=${sig}` },
  })
}

function waPayload(
  messages: unknown[],
  opts: { phoneNumberId?: string; from?: string; name?: string } = {},
) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: opts.phoneNumberId ?? PNID },
              contacts: opts.from
                ? [
                    {
                      wa_id: opts.from,
                      profile: { name: opts.name ?? "Client" },
                    },
                  ]
                : [],
              messages,
            },
          },
        ],
      },
    ],
  }
}

const textMsg = (
  from: string,
  id = `wamid.${randomUUID()}`,
  body = "Bonjour",
) => ({
  from,
  id,
  timestamp: "1793434800",
  type: "text",
  text: { body },
})

async function messagesFor(phone: string) {
  const [conv] = await withSystemContext((tx) =>
    tx
      .select({ id: crmConversations.id, name: crmConversations.contactName })
      .from(crmConversations)
      .where(
        and(
          eq(crmConversations.agencyId, agencyId),
          eq(crmConversations.contactPhone, phone),
        ),
      ),
  )
  if (!conv) return { conv: null, bodies: [] as string[] }
  const rows = await withSystemContext((tx) =>
    tx
      .select({ body: crmMessages.body })
      .from(crmMessages)
      .where(eq(crmMessages.conversationId, conv.id)),
  )
  return { conv, bodies: rows.map((r) => r.body) }
}

const phone = () =>
  `2169${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`

test("GET : sans jeton configuré → 503 ; bon jeton → challenge ; mauvais → 403", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const url = (token: string) =>
    new NextRequest(
      `https://example.test/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=77`,
    )
  const ok = await route.GET(url(VERIFY_TOKEN))
  assert.equal(ok.status, 200)
  assert.equal(await ok.text(), "77")
  assert.equal((await route.GET(url("faux"))).status, 403)
  delete process.env.WHATSAPP_VERIFY_TOKEN
  try {
    assert.equal((await route.GET(url(VERIFY_TOKEN))).status, 503)
  } finally {
    process.env.WHATSAPP_VERIFY_TOKEN = VERIFY_TOKEN
  }
})

test("POST : signature invalide → 400 ; secret absent → 503 ; rien n'est écrit", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const p = phone()
  const bad = await route.POST(signedPost(waPayload([textMsg(p)]), "mauvais"))
  assert.equal(bad.status, 400)
  delete process.env.WHATSAPP_APP_SECRET
  try {
    assert.equal(
      (await route.POST(signedPost(waPayload([textMsg(p)])))).status,
      503,
    )
  } finally {
    process.env.WHATSAPP_APP_SECRET = APP_SECRET
  }
  assert.equal((await messagesFor(p)).conv, null)
})

test("message texte → conversation + prospect (une notification) ; renvoi Meta → aucun doublon", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const p = phone()
  const payload = waPayload(
    [textMsg(p, `wamid.${randomUUID()}`, "Un devis Omra ?")],
    {
      from: p,
      name: "Amine",
    },
  )
  const before = notified.length
  const res = await route.POST(signedPost(payload))
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { ok: true, processed: 1, ignored: 0 })
  const first = await messagesFor(p)
  assert.equal(first.conv?.name, "Amine")
  assert.deepEqual(first.bodies, ["Un devis Omra ?"])
  assert.equal(notified.length, before + 1)

  const replay = await route.POST(signedPost(payload))
  assert.equal(replay.status, 200)
  assert.deepEqual((await messagesFor(p)).bodies, ["Un devis Omra ?"])
  assert.equal(notified.length, before + 1, "pas de seconde notification")
})

test("accusés de livraison seuls → 200, rien d'écrit ; objet ≠ WhatsApp → ignoré", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const statuses = {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: PNID },
              statuses: [{ id: "x" }],
            },
          },
        ],
      },
    ],
  }
  const r1 = await route.POST(signedPost(statuses))
  assert.deepEqual(await r1.json(), { ok: true, processed: 0, ignored: 0 })
  const r2 = await route.POST(signedPost({ object: "page", entry: [] }))
  assert.deepEqual(await r2.json(), { ok: true, processed: 0, ignored: 1 })
})

test("W-03 : WHATSAPP_PHONE_NUMBER_ID configuré → autre numéro ignoré et tracé ; bon numéro traité", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  process.env.WHATSAPP_PHONE_NUMBER_ID = PNID
  try {
    const foreign = phone()
    const res = await route.POST(
      signedPost(
        waPayload([textMsg(foreign)], { phoneNumberId: "PNID-AUTRE" }),
      ),
    )
    assert.deepEqual(await res.json(), { ok: true, processed: 0, ignored: 1 })
    assert.equal((await messagesFor(foreign)).conv, null)
    const traces = await withSystemContext((tx) =>
      tx
        .select({ action: auditEvents.action, diff: auditEvents.diff })
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.agencyId, agencyId),
            eq(auditEvents.entityId, "PNID-AUTRE"),
          ),
        ),
    )
    assert.deepEqual(traces, [
      {
        action: "whatsapp.inbound_ignored",
        diff: { reason: "foreign_phone_number", phoneNumberId: "PNID-AUTRE" },
      },
    ])

    const own = phone()
    const ok = await route.POST(signedPost(waPayload([textMsg(own)])))
    assert.deepEqual(await ok.json(), { ok: true, processed: 1, ignored: 0 })
  } finally {
    delete process.env.WHATSAPP_PHONE_NUMBER_ID
  }
})

test("W-06 : photo avec légende et réponse à un bouton → visibles dans la conversation ; réaction ignorée", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const p = phone()
  const res = await route.POST(
    signedPost(
      waPayload([
        {
          from: p,
          id: `wamid.${randomUUID()}`,
          timestamp: "1793434800",
          type: "image",
          image: { caption: "Mon passeport" },
        },
        {
          from: p,
          id: `wamid.${randomUUID()}`,
          timestamp: "1793434801",
          type: "button",
          button: { text: "Oui, je confirme" },
        },
        {
          from: p,
          id: `wamid.${randomUUID()}`,
          timestamp: "1793434802",
          type: "reaction",
        },
      ]),
    ),
  )
  assert.deepEqual(await res.json(), { ok: true, processed: 2, ignored: 0 })
  assert.deepEqual((await messagesFor(p)).bodies.sort(), [
    "Oui, je confirme",
    "[Photo reçue — à consulter sur WhatsApp] Mon passeport",
  ])
})
