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
