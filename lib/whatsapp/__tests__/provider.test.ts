/**
 * Tests unitaires — `lib/whatsapp/provider.ts`.
 *
 * Objectif : garantir qu'en l'absence de credentials Meta réels
 * (`WHATSAPP_ACCESS_TOKEN`/`WHATSAPP_PHONE_NUMBER_ID`), l'abstraction
 * `WhatsAppProvider` renvoie honnêtement `WHATSAPP_PROVIDER_NOT_CONFIGURED`
 * — jamais un faux succès. Vérifie aussi la normalisation de numéro
 * (utilisée par l'adaptateur réel avant tout envoi).
 */

import test from "node:test"
import assert from "node:assert/strict"

import {
  getWhatsAppProvider,
  hasConfiguredWhatsAppProvider,
  normalizeWhatsAppPhone,
} from "@/lib/whatsapp/provider"

function withoutWhatsAppEnv<T>(fn: () => T): T {
  const savedToken = process.env.WHATSAPP_ACCESS_TOKEN
  const savedPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
  delete process.env.WHATSAPP_ACCESS_TOKEN
  delete process.env.WHATSAPP_PHONE_NUMBER_ID
  try {
    return fn()
  } finally {
    if (savedToken !== undefined) process.env.WHATSAPP_ACCESS_TOKEN = savedToken
    if (savedPhoneId !== undefined)
      process.env.WHATSAPP_PHONE_NUMBER_ID = savedPhoneId
  }
}

test("normalizeWhatsAppPhone : chiffres avec indicatif ; numéro tunisien local → 216 (W-01) ; longueurs implausibles rejetées", () => {
  assert.equal(normalizeWhatsAppPhone("+216 98 123 456"), "21698123456")
  // WHATSAPP-CRM-01 (W-01) : un numéro local tunisien reçoit l'indicatif.
  assert.equal(normalizeWhatsAppPhone("98123456"), "21698123456")
  assert.equal(normalizeWhatsAppPhone("98 123 456"), "21698123456")
  assert.equal(normalizeWhatsAppPhone("0021698123456"), "21698123456")
  assert.equal(normalizeWhatsAppPhone("0033612345678"), "33612345678")
  assert.equal(normalizeWhatsAppPhone("+33 6 12 34 56 78"), "33612345678")
  assert.equal(normalizeWhatsAppPhone("123"), null)
  assert.equal(normalizeWhatsAppPhone("1".repeat(20)), null)
})

test("hasConfiguredWhatsAppProvider() : false quand les deux credentials sont absents", () => {
  withoutWhatsAppEnv(() => {
    assert.equal(hasConfiguredWhatsAppProvider(), false)
  })
})

test("hasConfiguredWhatsAppProvider() : false si un seul des deux credentials est présent", () => {
  withoutWhatsAppEnv(() => {
    process.env.WHATSAPP_ACCESS_TOKEN = "fake-token"
    try {
      assert.equal(hasConfiguredWhatsAppProvider(), false)
    } finally {
      delete process.env.WHATSAPP_ACCESS_TOKEN
    }
  })
})

test("hasConfiguredWhatsAppProvider() : true quand les deux sont présents", () => {
  withoutWhatsAppEnv(() => {
    process.env.WHATSAPP_ACCESS_TOKEN = "fake-token"
    process.env.WHATSAPP_PHONE_NUMBER_ID = "123456"
    try {
      assert.equal(hasConfiguredWhatsAppProvider(), true)
    } finally {
      delete process.env.WHATSAPP_ACCESS_TOKEN
      delete process.env.WHATSAPP_PHONE_NUMBER_ID
    }
  })
})

test("getWhatsAppProvider() : provider non configuré tant qu'aucun credential n'est présent", () => {
  withoutWhatsAppEnv(() => {
    const provider = getWhatsAppProvider()
    assert.equal(provider.configured, false)
    assert.equal(provider.name, "not_configured")
  })
})

test("sendTemplateMessage() : jamais de faux succès sans credentials — code explicite", async () => {
  await withoutWhatsAppEnv(async () => {
    const provider = getWhatsAppProvider()
    const result = await provider.sendTemplateMessage({
      to: "+21698123456",
      templateName: "booking_confirmed",
      languageCode: "fr",
      bodyParams: ["Client Test", "TG-2026-000001"],
    })
    assert.equal(result.ok, false)
    assert.equal(result.code, "WHATSAPP_PROVIDER_NOT_CONFIGURED")
    assert.ok(result.message && result.message.length > 0)
  })
})

test("getWhatsAppProvider() : sélectionne l'adaptateur Meta réel dès que les credentials sont présents", () => {
  withoutWhatsAppEnv(() => {
    process.env.WHATSAPP_ACCESS_TOKEN = "fake-token"
    process.env.WHATSAPP_PHONE_NUMBER_ID = "123456"
    try {
      const provider = getWhatsAppProvider()
      assert.equal(provider.configured, true)
      assert.equal(provider.name, "meta_cloud_api")
    } finally {
      delete process.env.WHATSAPP_ACCESS_TOKEN
      delete process.env.WHATSAPP_PHONE_NUMBER_ID
    }
  })
})

// ─── WHATSAPP-CRM-01 (W-02, W-04, W-07, W-08) ──────────────────────────

import { mock } from "node:test"
import { isRetryableWhatsAppFailure } from "@/lib/whatsapp/provider"

async function withMetaProvider<T>(fn: () => Promise<T>): Promise<T> {
  process.env.WHATSAPP_ACCESS_TOKEN = "wa-token-123"
  process.env.WHATSAPP_PHONE_NUMBER_ID = "PNID-1"
  try {
    return await fn()
  } finally {
    delete process.env.WHATSAPP_ACCESS_TOKEN
    delete process.env.WHATSAPP_PHONE_NUMBER_ID
  }
}

test("W-02 : numéro invalide → message sans le numéro saisi", async () => {
  await withMetaProvider(async () => {
    const r = await getWhatsAppProvider().sendSessionMessage({
      to: "123",
      body: "x",
    })
    assert.equal(r.code, "WHATSAPP_INVALID_PHONE")
    assert.doesNotMatch(r.message ?? "", /123/)
  })
})

test("W-04 + W-07 : URL via la version Meta commune ; échec → diagnostic filtré, message sans destinataire ni jeton", async () => {
  await withMetaProvider(async () => {
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
              message: "Recipient 21698123456 not in allowed list",
              code: 131030,
              type: "OAuthException",
              fbtrace_id: "Tr4ce",
            },
          }),
          { status: 400 },
        )
      },
    )
    try {
      const r = await getWhatsAppProvider().sendSessionMessage({
        to: "98123456",
        body: "Bonjour",
      })
      assert.equal(
        calls[0]!.url,
        "https://graph.facebook.com/v21.0/PNID-1/messages",
      )
      assert.equal(calls[0]!.auth, "Bearer wa-token-123")
      assert.equal(r.ok, false)
      assert.equal(r.code, "WHATSAPP_SEND_FAILED")
      assert.deepEqual(r.graph, {
        status: 400,
        code: 131030,
        type: "OAuthException",
        fbtraceId: "Tr4ce",
      })
      assert.doesNotMatch(r.message ?? "", /21698123456|wa-token/)
      assert.equal(isRetryableWhatsAppFailure(r), false, "4xx : définitif")
    } finally {
      f.mock.restore()
    }
  })
})

test("W-07 : WHATSAPP_API_VERSION reste une surcharge ; sinon META_GRAPH_API_VERSION", async () => {
  await withMetaProvider(async () => {
    const urls: string[] = []
    const f = mock.method(globalThis, "fetch", async (input: string | URL) => {
      urls.push(String(input))
      return new Response(JSON.stringify({ messages: [{ id: "wamid.1" }] }), {
        status: 200,
      })
    })
    try {
      process.env.META_GRAPH_API_VERSION = "v24.0"
      await getWhatsAppProvider().sendSessionMessage({
        to: "98123456",
        body: "a",
      })
      process.env.WHATSAPP_API_VERSION = "v23.0"
      const ok = await getWhatsAppProvider().sendSessionMessage({
        to: "98123456",
        body: "b",
      })
      assert.deepEqual(urls, [
        "https://graph.facebook.com/v24.0/PNID-1/messages",
        "https://graph.facebook.com/v23.0/PNID-1/messages",
      ])
      assert.deepEqual(ok, { ok: true, providerMessageId: "wamid.1" })
    } finally {
      f.mock.restore()
      delete process.env.META_GRAPH_API_VERSION
      delete process.env.WHATSAPP_API_VERSION
    }
  })
})

test("W-08 : seuls réseau, 429 et 5xx sont temporaires", () => {
  const failed = (status?: number) => ({
    ok: false,
    code: "WHATSAPP_SEND_FAILED" as const,
    ...(status !== undefined ? { graph: { status } } : {}),
  })
  assert.equal(isRetryableWhatsAppFailure(failed()), true, "réseau")
  assert.equal(isRetryableWhatsAppFailure(failed(429)), true)
  assert.equal(isRetryableWhatsAppFailure(failed(503)), true)
  assert.equal(isRetryableWhatsAppFailure(failed(400)), false)
  assert.equal(
    isRetryableWhatsAppFailure({ ok: false, code: "WHATSAPP_INVALID_PHONE" }),
    false,
  )
  assert.equal(
    isRetryableWhatsAppFailure({
      ok: false,
      code: "WHATSAPP_PROVIDER_NOT_CONFIGURED",
    }),
    false,
  )
  assert.equal(isRetryableWhatsAppFailure({ ok: true }), false)
})
