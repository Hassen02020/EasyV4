/**
 * CRM-META-CONNECT-01 (lot A) — version Graph unique et champs Lead Ads
 * explicites. Aucun appel réseau réel (fetch simulé).
 */
import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { metaGraphUrl } from "../graph"
import {
  fetchMetaLeadFieldDataCore,
  LEAD_FIELDS,
} from "@/lib/meta-leadads/provider"

test("version Graph : v21.0 par défaut, META_GRAPH_API_VERSION si définie", () => {
  const saved = process.env.META_GRAPH_API_VERSION
  delete process.env.META_GRAPH_API_VERSION
  assert.equal(
    metaGraphUrl("me/messages"),
    "https://graph.facebook.com/v21.0/me/messages",
  )
  process.env.META_GRAPH_API_VERSION = "v22.0"
  assert.equal(
    metaGraphUrl("/me/messages"),
    "https://graph.facebook.com/v22.0/me/messages",
  )
  if (saved === undefined) delete process.env.META_GRAPH_API_VERSION
  else process.env.META_GRAPH_API_VERSION = saved
})

test("Lead Ads : champs demandés explicitement (id, created_time, field_data)", async () => {
  const savedToken = process.env.META_PAGE_ACCESS_TOKEN
  process.env.META_PAGE_ACCESS_TOKEN = "tok"
  const calls: string[] = []
  const fetchMock = mock.method(globalThis, "fetch", async (url: string) => {
    calls.push(String(url))
    return new Response(
      JSON.stringify({
        id: "lg_1",
        field_data: [{ name: "email", values: ["a@b.test"] }],
      }),
      { status: 200 },
    )
  })
  const r = await fetchMetaLeadFieldDataCore("lg_1")
  fetchMock.mock.restore()
  if (savedToken === undefined) delete process.env.META_PAGE_ACCESS_TOKEN
  else process.env.META_PAGE_ACCESS_TOKEN = savedToken

  assert.equal(LEAD_FIELDS, "id,created_time,field_data")
  assert.match(
    calls[0]!,
    /\/lg_1\?fields=id,created_time,field_data&access_token=tok$/,
  )
  assert.ok(r.ok && r.lead.fields.email === "a@b.test")
})

test("une seule construction d'URL Graph pour Meta (réponse Messenger/Instagram comprise)", () => {
  for (const f of [
    "lib/meta-leadads/provider.ts",
    "lib/admin/inbox-actions.ts",
  ]) {
    const src = readFileSync(f, "utf8")
    assert.doesNotMatch(src, /graph\.facebook\.com/, f)
    assert.match(src, /metaGraphUrl\(/, f)
  }
})
