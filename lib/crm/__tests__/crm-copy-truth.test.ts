/**
 * CRM-ANALYTICS-COPY-ACTIONS-01 (G-31) — les textes de l'analytique et de
 * l'inbox doivent décrire ce que le code fait réellement.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const read = (p: string) => readFileSync(p, "utf8")

test("Action Engine : plus de promesse « exécutables », accès réel au traitement", () => {
  const page = read("app/(internal)/admin/analytics/action/page.tsx")
  assert.doesNotMatch(page, /exécutables/)
  assert.match(page, /aucune n&apos;est exécutée/)
  assert.match(page, /href="\/admin\/analytics\/campaign-engine"/)
  assert.match(page, /href="\/admin\/support"/)
})

test("hub analytique : pas d'« actions automatiques » ni d'« historique des actions »", () => {
  const hub = read("app/(internal)/admin/analytics/page.tsx")
  assert.doesNotMatch(
    hub,
    /actions automatiques|Historique des actions passées/,
  )
})

test("inbox : liste les 3 webhooks réellement présents, sans prétendre qu'ils sont connectés", () => {
  const inbox = read("components/admin/inbox-panel.tsx")
  assert.doesNotMatch(inbox, /seul canal réellement connecté/)
  for (const channel of ["whatsapp", "instagram", "messenger"]) {
    assert.ok(read(`app/api/webhooks/${channel}/route.ts`).length > 0)
  }
  assert.match(inbox, /WhatsApp, Instagram et Messenger/)
})
