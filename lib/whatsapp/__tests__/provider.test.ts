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
    if (savedPhoneId !== undefined) process.env.WHATSAPP_PHONE_NUMBER_ID = savedPhoneId
  }
}

test("normalizeWhatsAppPhone : garde uniquement les chiffres, rejette les longueurs implausibles", () => {
  assert.equal(normalizeWhatsAppPhone("+216 98 123 456"), "21698123456")
  assert.equal(normalizeWhatsAppPhone("98123456"), "98123456")
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
