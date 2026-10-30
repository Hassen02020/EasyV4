/**
 * CRM-LEAD-FLOW-01 — conservation de la campagne pendant la navigation
 * (fonctions pures, stockage simulé).
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  CAMPAIGN_STORAGE_KEY,
  extractCampaignRef,
  rememberCampaignRef,
  resolveCampaignRef,
} from "../campaign-attribution-client"

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    map,
  }
}
const throwing = {
  getItem: () => {
    throw new Error("SecurityError")
  },
  setItem: () => {
    throw new Error("SecurityError")
  },
}
const qs = (s: string) => new URLSearchParams(s)

test("extractCampaignRef : ?campaign prioritaire sur ?utm_campaign, vide → null, tronqué à 255", () => {
  assert.equal(extractCampaignRef(qs("campaign=a&utm_campaign=b")), "a")
  assert.equal(extractCampaignRef(qs("utm_campaign=b")), "b")
  assert.equal(extractCampaignRef(qs("utm_campaign=%20%20")), null)
  assert.equal(extractCampaignRef(qs("")), null)
  assert.equal(extractCampaignRef(null), null)
  assert.equal(
    extractCampaignRef(qs(`campaign=${"x".repeat(400)}`))!.length,
    255,
  )
})

test("premier contact : la première campagne vue est mémorisée, les suivantes ne l'écrasent pas", () => {
  const s = memoryStorage()
  rememberCampaignRef(s, "fb-ramadan")
  rememberCampaignRef(s, "tiktok-ete")
  rememberCampaignRef(s, null)
  assert.equal(s.map.get(CAMPAIGN_STORAGE_KEY), "fb-ramadan")
})

test("résolution : la campagne de la page courante prime, sinon celle mémorisée, sinon rien", () => {
  const s = memoryStorage({ [CAMPAIGN_STORAGE_KEY]: "fb-ramadan" })
  assert.equal(resolveCampaignRef(qs("utm_campaign=google-x"), s), "google-x")
  assert.equal(resolveCampaignRef(qs(""), s), "fb-ramadan")
  assert.equal(resolveCampaignRef(qs(""), memoryStorage()), undefined)
  assert.equal(resolveCampaignRef(qs(""), null), undefined)
})

test("stockage indisponible (navigation privée) : jamais d'exception, la page courante reste lue", () => {
  assert.doesNotThrow(() => rememberCampaignRef(throwing, "x"))
  assert.equal(resolveCampaignRef(qs("campaign=y"), throwing), "y")
  assert.equal(resolveCampaignRef(qs(""), throwing), undefined)
})

test("câblage : capture montée dans le layout public, formulaire avec consentement explicite non coché, notification fiable", () => {
  const root = process.cwd()
  const layout = readFileSync(
    join(root, "app/(public)/[locale]/layout.tsx"),
    "utf8",
  )
  assert.match(layout, /<CampaignAttributionCapture \/>/)
  const form = readFileSync(
    join(root, "components/leads/lead-capture-form.tsx"),
    "utf8",
  )
  assert.match(form, /useState\(false\)/)
  assert.match(form, /id="lead-marketing-consent"/)
  assert.match(form, /href="\/politique-confidentialite"/)
  assert.match(
    form,
    /resolveCampaignRef\(searchParams, safeSessionStorage\(\)\)/,
  )
  const action = readFileSync(join(root, "app/actions/submit-lead.ts"), "utf8")
  assert.match(action, /marketingConsent: z\.boolean\(\)\.default\(false\)/)
  assert.match(action, /sendEventReliable\(\s*"crm\/lead\.created"/)
  assert.match(action, /\{ leadId, agencyId \}/)
  assert.doesNotMatch(action, /inngest event failed \(non-fatal\)/)
})

test("i18n : libellés de consentement présents en FR, EN et AR", () => {
  for (const lang of ["fr", "en", "ar"]) {
    const common = JSON.parse(
      readFileSync(join(process.cwd(), `messages/${lang}.json`), "utf8"),
    ).Common as Record<string, string>
    assert.ok(common.leadFormConsentLabel?.length > 20, lang)
    assert.ok(common.leadFormConsentPrivacyLink?.length > 3, lang)
  }
})
