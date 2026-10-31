/**
 * CRM-E / CRM-OUTBOUND-META-01 — invariants statiques pour les canaux CRM :
 * Messenger, Instagram, Resend inbound email + réponses sortantes Meta.
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
const inboxActions = readFileSync(
  join(process.cwd(), "lib/admin/inbox-actions.ts"),
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

test("[Resend] passe par captureInboundEmailLeadCore (provenance email, dédup email_id) — CRM-SOCIAL-CODE-FIX-01", () => {
  // Avant : captureWebsiteLeadCore appelée directement → provenance
  // enregistrée comme formulaire du site. Désormais via le cœur dédié, qui
  // réutilise captureWebsiteLeadCore avec la provenance email.
  assert.match(resendRoute, /captureInboundEmailLeadCore\(tx, \{/)
  assert.doesNotMatch(resendRoute, /captureWebsiteLeadCore/)
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

// ===========================================================================
// inbox-actions.ts — canSendOutbound + Meta Send API (CRM-OUTBOUND-META-01)
// ===========================================================================

test("[inbox-actions] META_PAGE_ACCESS_TOKEN vérifié avant tout appel Meta Send", () => {
  const tokenPos = inboxActions.indexOf("META_PAGE_ACCESS_TOKEN")
  const fetchPos = inboxActions.indexOf(
    "https://graph.facebook.com/v21.0/me/messages",
  )
  assert.ok(tokenPos > -1, "META_PAGE_ACCESS_TOKEN doit être référencé")
  assert.ok(
    fetchPos > -1,
    "URL Meta Send API doit être présente dans inbox-actions",
  )
  assert.ok(
    tokenPos < fetchPos,
    "META_PAGE_ACCESS_TOKEN doit apparaître AVANT l'appel fetch Meta",
  )
})

test("[inbox-actions] messaging_type RESPONSE présent (obligation Meta pour réponses dans fenêtre)", () => {
  assert.match(
    inboxActions,
    /messaging_type['":\s]+["']RESPONSE["']/,
    "messaging_type:'RESPONSE' requis par Meta Send API",
  )
})

test("[inbox-actions] recipient.id utilisé — jamais recipient.phone (PSID, pas numéro)", () => {
  assert.match(
    inboxActions,
    /recipient:\s*\{\s*id:/,
    "recipient doit utiliser id (PSID), pas phone",
  )
  assert.doesNotMatch(
    inboxActions,
    /recipient:\s*\{\s*phone/,
    "recipient.phone ne doit jamais être utilisé pour Messenger/Instagram",
  )
})

test("[inbox-actions] canSendOutbound garde séparé de isChannelConnected (inbound ≠ outbound)", () => {
  assert.match(
    inboxActions,
    /canSendOutbound/,
    "canSendOutbound doit exister comme garde outbound dédié",
  )
  assert.doesNotMatch(
    inboxActions,
    /isChannelConnected.*canReply/,
    "canReply ne doit plus dépendre de isChannelConnected (remplacé par canSendOutbound)",
  )
})

test("[inbox-actions] canSendSessionMessage vérifié avant envoi Meta (fenêtre 24h)", () => {
  const sessionPos = inboxActions.indexOf("canSendSessionMessage(conversation)")
  const metaFetchPos = inboxActions.indexOf(
    "https://graph.facebook.com/v21.0/me/messages",
  )
  assert.ok(
    sessionPos > -1,
    "canSendSessionMessage doit être appelée dans sendReply",
  )
  assert.ok(
    sessionPos < metaFetchPos,
    "canSendSessionMessage doit être vérifié AVANT l'appel fetch Meta",
  )
})

test("[inbox-actions] journalisation après confirmation Meta — jamais avant", () => {
  const metaFetchPos = inboxActions.indexOf(
    "https://graph.facebook.com/v21.0/me/messages",
  )
  const appendPos = inboxActions.lastIndexOf("appendOutboundMessageCore(")
  assert.ok(
    metaFetchPos < appendPos,
    "appendOutboundMessageCore doit être appelé APRÈS la confirmation Meta",
  )
})
