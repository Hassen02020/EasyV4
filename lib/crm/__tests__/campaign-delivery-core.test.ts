/**
 * CAMPAIGN-DELIVERY-01 / CRM-CAMPAIGN-SAFETY-01 — tests unitaires des
 * éléments purs de la livraison et du gabarit d'email. Le comportement de
 * livraison (envoi, reprise, annulation, consentement, désinscription) est
 * prouvé sur PostgreSQL réel par campaign-safety-live.test.ts (CI
 * financial-e2e) — l'ancien cas « succès » en test.skip est remplacé par
 * ces preuves réelles.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import {
  campaignEmailIdempotencyKey,
  campaignUnsubscribeUrls,
} from "../campaign-delivery-core"
import { renderCampaignEmailHtml } from "@/lib/email/templates/campaign-email"

test("clé d'idempotence Resend stable par campagne et par cible", () => {
  assert.equal(
    campaignEmailIdempotencyKey("camp-1", "target-9"),
    "campaign:camp-1:target-9",
  )
})

test("liens de désinscription : page de confirmation et POST un clic, sans slash double", () => {
  assert.deepEqual(
    campaignUnsubscribeUrls("https://easy2book-new.vercel.app/", "t-1"),
    {
      page: "https://easy2book-new.vercel.app/fr/desabonnement/t-1",
      oneClick: "https://easy2book-new.vercel.app/api/crm/unsubscribe/t-1",
    },
  )
})

test("gabarit : lien de désinscription présent et valeurs échappées", () => {
  const html = renderCampaignEmailHtml({
    campaignName: 'Promo <script>"x"</script>',
    message: "Ligne 1\n<b>Ligne 2</b>",
    agencyName: "Agence & Co",
    unsubscribeUrl: "https://example.test/fr/desabonnement/abc",
  })
  assert.match(html, /href="https:\/\/example\.test\/fr\/desabonnement\/abc"/)
  assert.match(html, /Se désinscrire/)
  assert.doesNotMatch(html, /<script>/)
  assert.match(
    html,
    /<title>Promo &lt;script&gt;&quot;x&quot;&lt;\/script&gt;<\/title>/,
  )
  assert.match(html, /Ligne 1<br>&lt;b&gt;Ligne 2&lt;\/b&gt;/)
  assert.match(html, /Agence &amp; Co/)
})

test("signature : seules les coordonnées renseignées sont affichées, rien n'est inventé", () => {
  const html = renderCampaignEmailHtml({
    campaignName: "Offre",
    message: "Bonjour",
    agencyName: "Easy2Book",
    unsubscribeUrl: "https://example.test/fr/desabonnement/abc",
    signature: {
      phone: "+216 98 140 514",
      siteUrl: "https://easy2book-new.vercel.app/",
    },
  })
  assert.match(html, /L'équipe Easy2Book/)
  assert.match(html, /href="tel:\+21698140514"/)
  assert.match(html, />easy2book-new\.vercel\.app</)
  assert.match(
    html,
    /src="https:\/\/easy2book-new\.vercel\.app\/easy2book-logo\.png"/,
  )
  assert.doesNotMatch(
    html,
    /WhatsApp|mailto:|Adresse|Facebook|Instagram|TikTok/,
  )
})

test("signature : liens non http(s) ignorés et valeurs échappées", () => {
  const html = renderCampaignEmailHtml({
    campaignName: "Offre",
    message: "Bonjour",
    unsubscribeUrl: "https://example.test/fr/desabonnement/abc",
    signature: {
      whatsapp: "+216 22 333 444",
      email: "contact@agence.test",
      address: "Rue <b>X</b>, Tunis",
      facebookUrl: "javascript:alert(1)",
      instagramUrl: "https://instagram.com/agence",
      logoUrl: "data:image/png;base64,xx",
    },
  })
  assert.match(html, /href="https:\/\/wa\.me\/21622333444"/)
  assert.match(html, /href="mailto:contact@agence\.test"/)
  assert.match(html, /Rue &lt;b&gt;X&lt;\/b&gt;, Tunis/)
  assert.match(html, /href="https:\/\/instagram\.com\/agence"/)
  assert.doesNotMatch(html, /javascript:|Facebook|data:image/)
  // Sans siteUrl ni logo http(s) : pas d'image.
  assert.doesNotMatch(html, /<img/)
})
