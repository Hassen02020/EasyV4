/**
 * WHATSAPP-CRM-01 (W-03, W-06) — lecture des notifications WhatsApp,
 * fonction pure : objet attendu, numéro attendu, messages non texte rendus
 * visibles, accusés et réactions ignorés.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import {
  extractWhatsAppInboundMessages,
  whatsAppMessageBody,
  type WhatsAppRawMessage,
} from "../inbound"

const change = (
  phoneNumberId: string,
  messages: WhatsAppRawMessage[],
  contacts: Array<{ wa_id?: string; profile?: { name?: string } }> = [],
) => ({
  field: "messages",
  value: { metadata: { phone_number_id: phoneNumberId }, contacts, messages },
})

test("objet autre que whatsapp_business_account → rien lu, signalé", () => {
  const r = extractWhatsAppInboundMessages({ object: "page", entry: [] }, null)
  assert.deepEqual(r, {
    messages: [],
    ignored: [{ reason: "not_whatsapp_object", phoneNumberId: null }],
  })
})

test("numéro attendu : un autre phone_number_id est écarté ; sans numéro configuré, tout est lu", () => {
  const payload = {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          change("PNID-A", [
            {
              from: "21698000001",
              id: "wamid.A",
              type: "text",
              text: { body: "A" },
            },
          ]),
          change("PNID-B", [
            {
              from: "21698000002",
              id: "wamid.B",
              type: "text",
              text: { body: "B" },
            },
          ]),
        ],
      },
    ],
  }
  const scoped = extractWhatsAppInboundMessages(payload, "PNID-A")
  assert.deepEqual(
    scoped.messages.map((m) => m.id),
    ["wamid.A"],
  )
  assert.deepEqual(scoped.ignored, [
    { reason: "foreign_phone_number", phoneNumberId: "PNID-B" },
  ])
  assert.equal(extractWhatsAppInboundMessages(payload, null).messages.length, 2)
})

test("nom du contact repris ; accusés (statuses) ignorés", () => {
  const r = extractWhatsAppInboundMessages(
    {
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            change(
              "PNID-A",
              [
                {
                  from: "21698000001",
                  id: "wamid.1",
                  timestamp: "1793434800",
                  type: "text",
                  text: { body: "Bonjour" },
                },
              ],
              [{ wa_id: "21698000001", profile: { name: "Amine" } }],
            ),
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: "PNID-A" },
                statuses: [{ id: "x" }],
              },
            },
          ],
        },
      ],
    },
    "PNID-A",
  )
  assert.deepEqual(r.messages, [
    {
      from: "21698000001",
      id: "wamid.1",
      timestamp: "1793434800",
      body: "Bonjour",
      contactName: "Amine",
    },
  ])
  assert.deepEqual(r.ignored, [])
})

test("W-06 : bouton, réponse interactive, médias → ligne visible ; réaction / système → ignorés", () => {
  assert.equal(
    whatsAppMessageBody({ type: "button", button: { text: "Oui" } }),
    "Oui",
  )
  assert.equal(
    whatsAppMessageBody({
      type: "interactive",
      interactive: { button_reply: { title: "Omra" } },
    }),
    "Omra",
  )
  assert.equal(
    whatsAppMessageBody({
      type: "interactive",
      interactive: { list_reply: { title: "Juin" } },
    }),
    "Juin",
  )
  assert.equal(
    whatsAppMessageBody({ type: "image", image: { caption: "Mon passeport" } }),
    "[Photo reçue — à consulter sur WhatsApp] Mon passeport",
  )
  assert.equal(
    whatsAppMessageBody({ type: "audio" }),
    "[Message audio reçu — à consulter sur WhatsApp]",
  )
  assert.equal(
    whatsAppMessageBody({ type: "document", document: { filename: "x.pdf" } }),
    "[Document reçu — à consulter sur WhatsApp]",
  )
  assert.equal(
    whatsAppMessageBody({ type: "location" }),
    "[Localisation reçue — à consulter sur WhatsApp]",
  )
  assert.equal(whatsAppMessageBody({ type: "reaction" }), null)
  assert.equal(whatsAppMessageBody({ type: "system" }), null)
  assert.equal(whatsAppMessageBody({ type: "unsupported" }), null)
  assert.equal(
    whatsAppMessageBody({ type: "text", text: { body: "   " } }),
    null,
  )
})

test("W-08 : la tâche de confirmation ne relance que les échecs temporaires", () => {
  assert.match(
    readFileSync("lib/inngest/functions/send-whatsapp-confirmation.ts", "utf8"),
    /if \(outcome\.outcome === "failed" && outcome\.retryable\) \{/,
  )
})
