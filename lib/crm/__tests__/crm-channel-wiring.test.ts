/**
 * CRM-E — invariants statiques pour les 3 nouveaux canaux CRM :
 * Messenger, Instagram, Resend inbound email.
 *
 * Pattern readFileSync (voir lib/admin/__tests__/create-lead-wiring.test.ts) :
 * vérifie statiquement les propriétés de sécurité et de câblage sans
 * instancier de serveur ni accéder à la DB.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const messengerRoute = readFileSync(
  join(process.cwd(), "app/api/webhooks/messenger/route.ts"),
  "utf8",
)
const instagramRoute = readFileSync(
  join(process.cwd(), "app/api/webhooks/instagram/route.ts"),
  "utf8",
)
const resendRoute = readFileSync(
  join(process.cwd(), "app/api/webhooks/resend-inbound/route.ts"),
  "utf8",
)
const inboxCore = readFileSync(
  join(process.cwd(), "lib/crm/inbox-core.ts"),
  "utf8",
)

// ===========================================================================
// Messenger webhook
// ===========================================================================

test("[Messenger] exporte GET + POST", () => {
  assert.match(messengerRoute, /export async function GET\s*\(/, "GET manquant")
  assert.match(
    messengerRoute,
    /export async function POST\s*\(/,
    "POST manquant",
  )
})

test("[Messenger] 503 si META_APP_SECRET absent", () => {
  assert.match(
    messengerRoute,
    /process\.env\.META_APP_SECRET/,
    "META_APP_SECRET doit être vérifié",
  )
  assert.match(
    messengerRoute,
    /status:\s*503/,
    "503 doit être retourné si secret absent",
  )
})

test("[Messenger] GET utilise META_MESSENGER_VERIFY_TOKEN dédié", () => {
  assert.match(
    messengerRoute,
    /process\.env\.META_MESSENGER_VERIFY_TOKEN/,
    "token de vérification dédié requis",
  )
})

test("[Messenger] signature HMAC vérifiée avant toute logique", () => {
  const hmacPos = messengerRoute.indexOf("verifyWhatsAppSignature(")
  const agencyPos = messengerRoute.indexOf("getDefaultAgencyId()")
  assert.ok(hmacPos > -1, "verifyWhatsAppSignature doit être appelée")
  assert.ok(agencyPos > -1, "getDefaultAgencyId doit être appelée")
  assert.ok(
    hmacPos < agencyPos,
    "HMAC doit être vérifié AVANT getDefaultAgencyId",
  )
})

test("[Messenger] rejette les payloads dont object !== 'page'", () => {
  assert.match(
    messengerRoute,
    /payload\.object\s*!==\s*["']page["']/,
    "guard object:'page' manquant",
  )
})

test("[Messenger] channel='messenger' passé à upsertConversationForInboundCore", () => {
  assert.match(
    messengerRoute,
    /channel:\s*["']messenger["']/,
    "channel 'messenger' doit être passé",
  )
  assert.match(
    messengerRoute,
    /upsertConversationForInboundCore/,
    "upsertConversationForInboundCore doit être appelée",
  )
})

test("[Messenger] externalMessageId = message.mid (idempotence)", () => {
  assert.match(
    messengerRoute,
    /externalMessageId:\s*mid/,
    "externalMessageId doit être le mid Meta",
  )
})

test("[Messenger] toujours 200 dès que signature ok (Meta retry)", () => {
  assert.match(
    messengerRoute,
    /ok:\s*true/,
    "retour { ok: true, processed } attendu",
  )
  assert.match(
    messengerRoute,
    /processed/,
    "champ processed attendu dans la réponse",
  )
})

// ===========================================================================
// Instagram webhook
// ===========================================================================

test("[Instagram] exporte GET + POST", () => {
  assert.match(instagramRoute, /export async function GET\s*\(/, "GET manquant")
  assert.match(
    instagramRoute,
    /export async function POST\s*\(/,
    "POST manquant",
  )
})

test("[Instagram] 503 si META_APP_SECRET absent", () => {
  assert.match(
    instagramRoute,
    /process\.env\.META_APP_SECRET/,
    "META_APP_SECRET doit être vérifié",
  )
  assert.match(instagramRoute, /status:\s*503/, "503 requis si secret absent")
})

test("[Instagram] GET utilise META_INSTAGRAM_VERIFY_TOKEN dédié", () => {
  assert.match(
    instagramRoute,
    /process\.env\.META_INSTAGRAM_VERIFY_TOKEN/,
    "token de vérification dédié requis",
  )
})

test("[Instagram] signature HMAC vérifiée avant toute logique", () => {
  const hmacPos = instagramRoute.indexOf("verifyWhatsAppSignature(")
  const agencyPos = instagramRoute.indexOf("getDefaultAgencyId()")
  assert.ok(hmacPos > -1, "verifyWhatsAppSignature doit être appelée")
  assert.ok(agencyPos > -1, "getDefaultAgencyId doit être appelée")
  assert.ok(
    hmacPos < agencyPos,
    "HMAC doit être vérifié AVANT getDefaultAgencyId",
  )
})

test("[Instagram] rejette les payloads dont object !== 'instagram'", () => {
  assert.match(
    instagramRoute,
    /payload\.object\s*!==\s*["']instagram["']/,
    "guard object:'instagram' manquant",
  )
})

test("[Instagram] channel='instagram' passé à upsertConversationForInboundCore", () => {
  assert.match(
    instagramRoute,
    /channel:\s*["']instagram["']/,
    "channel 'instagram' doit être passé",
  )
  assert.match(
    instagramRoute,
    /upsertConversationForInboundCore/,
    "upsertConversationForInboundCore doit être appelée",
  )
})

test("[Instagram] externalMessageId = message.mid (idempotence)", () => {
  assert.match(
    instagramRoute,
    /externalMessageId:\s*mid/,
    "externalMessageId doit être le mid Meta",
  )
})

// ===========================================================================
// Resend inbound email webhook
// ===========================================================================

test("[Resend] exporte uniquement POST (pas de handshake GET)", () => {
  assert.match(resendRoute, /export async function POST\s*\(/, "POST manquant")
  assert.doesNotMatch(
    resendRoute,
    /export async function GET\s*\(/,
    "GET ne doit pas exister (Resend n'a pas de handshake)",
  )
})

test("[Resend] 503 si RESEND_INBOUND_SECRET absent", () => {
  assert.match(
    resendRoute,
    /process\.env\.RESEND_INBOUND_SECRET/,
    "RESEND_INBOUND_SECRET doit être vérifié",
  )
  assert.match(resendRoute, /status:\s*503/, "503 requis si secret absent")
})

test("[Resend] vérification constant-time du Bearer token", () => {
  assert.match(
    resendRoute,
    /timingSafeEqual/,
    "timingSafeEqual requis pour la comparaison du secret",
  )
  assert.match(
    resendRoute,
    /Bearer/,
    "le schéma Bearer doit être attendu dans l'Authorization",
  )
})

test("[Resend] 401 si autorisation invalide", () => {
  assert.match(resendRoute, /status:\s*401/, "401 requis si Bearer invalide")
})

test("[Resend] appelle captureWebsiteLeadCore avec channel implicite email", () => {
  assert.match(
    resendRoute,
    /captureWebsiteLeadCore/,
    "captureWebsiteLeadCore doit être appelée",
  )
})

test("[Resend] email extrait depuis payload.from (jamais inventé)", () => {
  assert.match(
    resendRoute,
    /extractEmail/,
    "extractEmail doit extraire l'email depuis payload.from",
  )
  assert.match(
    resendRoute,
    /payload\.from/,
    "payload.from doit être utilisé comme source de l'email",
  )
})

test("[Resend] sourcePage contient 'email_inbound' pour la traçabilité", () => {
  assert.match(
    resendRoute,
    /email_inbound/,
    "sourcePage doit contenir 'email_inbound'",
  )
})

// ===========================================================================
// inbox-core.ts — isChannelConnected étendu
// ===========================================================================

test("[inbox-core] isChannelConnected retourne true pour messenger", () => {
  assert.match(
    inboxCore,
    /channel\s*===\s*["']messenger["']/,
    "messenger doit être dans isChannelConnected",
  )
})

test("[inbox-core] isChannelConnected retourne true pour instagram", () => {
  assert.match(
    inboxCore,
    /channel\s*===\s*["']instagram["']/,
    "instagram doit être dans isChannelConnected",
  )
})

test("[inbox-core] isChannelConnected retourne true pour email", () => {
  assert.match(
    inboxCore,
    /channel\s*===\s*["']email["']/,
    "email doit être dans isChannelConnected",
  )
})

test("[inbox-core] origine câblée via template ${params.channel}_webhook", () => {
  assert.match(
    inboxCore,
    /\$\{params\.channel\}_webhook/,
    "source doit utiliser `${params.channel}_webhook` — couvre messenger et instagram",
  )
})

test("[inbox-core] WEBHOOK_CHANNELS inclut messenger et instagram", () => {
  assert.match(
    inboxCore,
    /["']messenger["']/,
    "'messenger' doit figurer dans WEBHOOK_CHANNELS",
  )
  assert.match(
    inboxCore,
    /["']instagram["']/,
    "'instagram' doit figurer dans WEBHOOK_CHANNELS",
  )
})
