/**
 * UTM-CAPTURE-01 — invariants statiques câblage capture UTM → leads.campaign_ref
 *
 * Vérifie que les 4 couches de la chaîne UTM Capture sont correctement câblées :
 *  1. createLeadCore (leads-core.ts) : `campaignRef` dans les params + INSERT
 *  2. captureWebsiteLeadCore (website-lead-capture-core.ts) : `campaignRef` dans
 *     WebsiteLeadCaptureParams + propagé à createLeadCore
 *  3. submitLead (app/actions/submit-lead.ts) : `campaignRef` dans le schéma zod +
 *     propagé à captureWebsiteLeadCore
 *  4. LeadCaptureForm (components/leads/lead-capture-form.tsx) : lit
 *     ?campaign= / ?utm_campaign= via useSearchParams et passe campaignRef
 *
 * Pattern readFileSync — `"use server"` et `"use client"` empêchent d'importer
 * les fichiers directement sous `node --test`.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()

const leadsCoreStr = readFileSync(join(ROOT, "lib/crm/leads-core.ts"), "utf8")
const captureCoreSrc = readFileSync(
  join(ROOT, "lib/crm/website-lead-capture-core.ts"),
  "utf8",
)
const submitLeadSrc = readFileSync(
  join(ROOT, "app/actions/submit-lead.ts"),
  "utf8",
)
const formSrc = readFileSync(
  join(ROOT, "components/leads/lead-capture-form.tsx"),
  "utf8",
)

// ─── Couche 1 : createLeadCore ────────────────────────────────────────────────

test("UTM-CAPTURE-01 (leads-core) : createLeadCore accepte campaignRef dans ses params", () => {
  assert.match(leadsCoreStr, /campaignRef\?:\s*string\s*\|\s*null/)
})

test("UTM-CAPTURE-01 (leads-core) : INSERT leads écrit campaignRef", () => {
  assert.match(leadsCoreStr, /campaignRef:\s*params\.campaignRef/)
})

// ─── Couche 2 : captureWebsiteLeadCore ───────────────────────────────────────

test("UTM-CAPTURE-01 (website-lead-capture-core) : WebsiteLeadCaptureParams contient campaignRef", () => {
  assert.match(captureCoreSrc, /campaignRef\?:\s*string\s*\|\s*null/)
})

test("UTM-CAPTURE-01 (website-lead-capture-core) : campaignRef propagé à createLeadCore", () => {
  assert.match(captureCoreSrc, /campaignRef:\s*params\.campaignRef/)
})

// ─── Couche 3 : submitLead server action ──────────────────────────────────────

test("UTM-CAPTURE-01 (submit-lead) : schéma zod inclut campaignRef", () => {
  assert.match(submitLeadSrc, /campaignRef:\s*z\.string/)
})

test("UTM-CAPTURE-01 (submit-lead) : campaignRef limité à 255 caractères", () => {
  assert.match(submitLeadSrc, /campaignRef.*max\(255\)/)
})

test("UTM-CAPTURE-01 (submit-lead) : campaignRef propagé à captureWebsiteLeadCore", () => {
  assert.match(submitLeadSrc, /campaignRef:\s*parsed\.data\.campaignRef/)
})

// ─── Couche 4 : LeadCaptureForm (client) ─────────────────────────────────────

test("UTM-CAPTURE-01 (lead-capture-form) : importe useSearchParams depuis next/navigation", () => {
  assert.match(formSrc, /import.*useSearchParams.*from.*next\/navigation/)
})

test("UTM-CAPTURE-01 (lead-capture-form) : lit ?campaign= param", () => {
  assert.match(formSrc, /searchParams\.get\("campaign"\)/)
})

test("UTM-CAPTURE-01 (lead-capture-form) : lit ?utm_campaign= comme fallback", () => {
  assert.match(formSrc, /searchParams\.get\("utm_campaign"\)/)
})

test("UTM-CAPTURE-01 (lead-capture-form) : campaignRef inclus dans SubmitLeadInput", () => {
  assert.match(formSrc, /campaignRef,/)
})

// ─── Garde sécurité : campaignRef jamais utilisé dans un calcul financier ────

test("UTM-CAPTURE-01 (sécurité) : campaignRef non présent dans les fichiers financiers", () => {
  const financialFiles = [
    "lib/finance/manual-payment-actions.ts",
    "lib/finance/recharge-actions.ts",
    "lib/payment/reservation-webhook-core.ts",
    "lib/payment/wallet-webhook-core.ts",
  ]
  for (const file of financialFiles) {
    const src = readFileSync(join(ROOT, file), "utf8")
    assert.doesNotMatch(
      src,
      /campaignRef/,
      `${file} ne doit pas référencer campaignRef — donnée analytique non financière`,
    )
  }
})
