/**
 * CRM-SOCIAL-CODE-FIX-01 — lecture des webhooks Messenger / Instagram :
 * échos de la Page ignorés, horodatage Meta en millisecondes, et câblage des
 * routes, de la réponse sortante et de la vue client 360.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { extractMetaInboundMessages } from "../meta-messaging"

const src = (rel: string) => readFileSync(rel, "utf8")

test("écho de la Page (réponse de l'agence) → ignoré ; message client → retenu", () => {
  const out = extractMetaInboundMessages({
    object: "page",
    entry: [
      {
        messaging: [
          {
            sender: { id: "PAGE" },
            timestamp: 1793434800000,
            message: { mid: "m.1", text: "Réponse agence", is_echo: true },
          },
          {
            sender: { id: "PSID-1" },
            timestamp: 1793434800000,
            message: { mid: "m.2", text: "Bonjour" },
          },
        ],
      },
    ],
  })
  assert.deepEqual(
    out.map((m) => [m.senderId, m.mid, m.text]),
    [["PSID-1", "m.2", "Bonjour"]],
  )
})

test("horodatage Meta en millisecondes (plus de date dans un futur lointain)", () => {
  const [m] = extractMetaInboundMessages({
    entry: [
      {
        messaging: [
          {
            sender: { id: "IG-1" },
            timestamp: 1793434800000,
            message: { mid: "m.3", text: "Salut" },
          },
        ],
      },
    ],
  })
  assert.equal(m!.sentAt.toISOString(), new Date(1793434800000).toISOString())
  assert.equal(m!.sentAt.getUTCFullYear(), 2026)
})

test("sans texte (pièce jointe, accusé), sans mid ou sans expéditeur → ignoré ; sans horodatage → maintenant", () => {
  const now = new Date("2026-10-31T09:00:00Z")
  const out = extractMetaInboundMessages(
    {
      entry: [
        {
          messaging: [
            { sender: { id: "A" }, message: { mid: "m.4" } },
            { sender: { id: "A" }, message: { text: "x" } },
            { message: { mid: "m.5", text: "x" } },
            { sender: { id: "B" }, message: { mid: "m.6", text: "ok" } },
          ],
        },
      ],
    },
    () => now,
  )
  assert.equal(out.length, 1)
  assert.equal(out[0]!.sentAt, now)
})

test("routes Messenger / Instagram : identifiant externe, jamais contactPhone ; lecture via extractMetaInboundMessages", () => {
  // CRM-META-CONNECT-01 : traitement partagé par /messenger, /instagram
  // et la route Page unifiée /meta-page.
  const core = src("lib/meta/page-webhook-core.ts")
  assert.match(core, /extractMetaInboundMessages\(/)
  assert.match(core, /contactExternalId: senderId/)
  assert.doesNotMatch(core, /contactPhone/)
  for (const ch of ["messenger", "instagram", "meta-page"]) {
    const route = src(`app/api/webhooks/${ch}/route.ts`)
    assert.match(route, /processMessagingEvents\(/, ch)
    assert.doesNotMatch(route, /contactPhone/, ch)
    assert.doesNotMatch(route, /timestamp \* 1000/, ch)
  }
})

test("réponse sortante : destinataire = contactExternalId pour Messenger / Instagram", () => {
  const actions = src("lib/admin/inbox-actions.ts")
  assert.match(
    actions,
    /const recipientId = isExternalIdChannel\(conversation\.channel\)\s*\?\s*conversation\.contactExternalId\s*:\s*conversation\.contactPhone/,
  )
  assert.match(actions, /recipient: \{ id: recipientId \}/)
  assert.doesNotMatch(
    actions,
    /recipient: \{ id: conversation\.contactPhone \}/,
  )
})

test("vue client 360 : repli par téléphone réservé à WhatsApp", () => {
  assert.match(
    src("lib/admin/customer-360-core.ts"),
    /c\.channel === "whatsapp" && c\.contactPhone === lead\.phone/,
  )
})
