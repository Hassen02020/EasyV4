/**
 * META-CRM-E2E-01 (lot 2) — fournisseur Lead Ads : jeton dans l'en-tête
 * (jamais dans l'URL), diagnostic Graph filtré (jamais le message brut).
 * `fetch` simulé : aucun appel Meta réel.
 */
import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { fetchMetaLeadFieldDataCore, parseMetaGraphError } from "../provider"

test("parseMetaGraphError : code, sous-code, type et trace seulement ; valeurs inattendues ignorées", () => {
  assert.deepEqual(
    parseMetaGraphError(400, {
      error: {
        message: "secret token xyz",
        code: 190,
        error_subcode: 463,
        type: "OAuthException",
        fbtrace_id: "Tr4ce-1",
      },
    }),
    {
      status: 400,
      code: 190,
      subcode: 463,
      type: "OAuthException",
      fbtraceId: "Tr4ce-1",
    },
  )
  assert.deepEqual(
    parseMetaGraphError(500, {
      error: { code: "100", type: "a b <script>", fbtrace_id: "x".repeat(65) },
    }),
    { status: 500 },
  )
  assert.deepEqual(parseMetaGraphError(502, null), { status: 502 })
  assert.deepEqual(parseMetaGraphError(502, "<html>"), { status: 502 })
})

test("fetchMetaLeadFieldDataCore : jeton absent → NOT_CONFIGURED, aucun appel", async () => {
  const saved = process.env.META_PAGE_ACCESS_TOKEN
  delete process.env.META_PAGE_ACCESS_TOKEN
  const f = mock.method(globalThis, "fetch", async () => new Response("{}"))
  try {
    const r = await fetchMetaLeadFieldDataCore("L1")
    assert.deepEqual(r, {
      ok: false,
      code: "META_LEADADS_PROVIDER_NOT_CONFIGURED",
    })
    assert.equal(f.mock.callCount(), 0)
  } finally {
    f.mock.restore()
    if (saved !== undefined) process.env.META_PAGE_ACCESS_TOKEN = saved
  }
})

test("fetchMetaLeadFieldDataCore : jeton en en-tête Authorization, jamais dans l'URL ; erreur → diagnostic sans message", async () => {
  const saved = process.env.META_PAGE_ACCESS_TOKEN
  process.env.META_PAGE_ACCESS_TOKEN = "tok-123"
  const calls: { url: string; auth: string | null }[] = []
  const f = mock.method(
    globalThis,
    "fetch",
    async (input: string | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        auth: new Headers(init?.headers).get("authorization"),
      })
      return new Response(
        JSON.stringify({
          error: {
            message: "tok-123 invalid",
            code: 190,
            type: "OAuthException",
          },
        }),
        { status: 401 },
      )
    },
  )
  try {
    const r = await fetchMetaLeadFieldDataCore("L 1")
    assert.equal(calls.length, 1)
    assert.doesNotMatch(calls[0]!.url, /tok-123|access_token/)
    assert.match(calls[0]!.url, /\/L%201\?fields=id,created_time,field_data$/)
    assert.equal(calls[0]!.auth, "Bearer tok-123")
    assert.equal(r.ok, false)
    if (!r.ok) {
      assert.equal(r.code, "META_LEADADS_FETCH_FAILED")
      assert.deepEqual(r.graph, {
        status: 401,
        code: 190,
        type: "OAuthException",
      })
      assert.doesNotMatch(JSON.stringify(r.graph), /tok-123|invalid/)
    }
  } finally {
    f.mock.restore()
    if (saved === undefined) delete process.env.META_PAGE_ACCESS_TOKEN
    else process.env.META_PAGE_ACCESS_TOKEN = saved
  }
})
