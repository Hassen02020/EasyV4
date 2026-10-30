/**
 * CRM-EMAIL-ESCAPE-01 (écart G-20, sécurité) — les emails internes CRM
 * n'interprètent jamais le HTML saisi par un visiteur.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { escapeHtml } from "@/lib/email/escape-html"
import { buildNewLeadEmailHtml } from "../process-new-lead"
import { buildStaleLeadsHtml } from "../notify-stale-leads"

const EVIL = `<img src=x onerror="alert(1)">`

test("escapeHtml : texte et attributs (guillemets simples et doubles)", () => {
  assert.equal(
    escapeHtml(`<a href="x" title='y'>&</a>`),
    "&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;",
  )
  assert.equal(escapeHtml(null), "")
})

test("email « nouveau lead » : nom, email (y compris mailto:), téléphone, produit, page et message échappés", () => {
  const html = buildNewLeadEmailHtml({
    agencyName: "Agence <b>X</b>",
    visitorName: `Amira ${EVIL}`,
    email: `a@b.tn" onclick="alert(2)`,
    phone: `+216 <script>1</script>`,
    product: EVIL,
    sourcePage: `/landing/omra"><script>3</script>`,
    message: `Bonjour ${EVIL} 'quote'`,
    adminUrl: "https://easy2book-new.vercel.app/admin/support",
  })
  assert.doesNotMatch(html, /<img|<script|<b>X/)
  assert.doesNotMatch(html, /" onclick="/)
  assert.match(html, /href="mailto:a@b\.tn&quot; onclick=&quot;alert\(2\)"/)
  assert.match(html, /Amira &lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/)
  assert.match(html, /&#39;quote&#39;/)
  assert.match(
    html,
    /href="https:\/\/easy2book-new\.vercel\.app\/admin\/support"/,
  )
})

test("email de relance : nom et contact des leads échappés", () => {
  const html = buildStaleLeadsHtml({
    agencyName: "Easy2Book",
    count: 1,
    thresholdDays: 3,
    now: new Date("2026-10-30T12:00:00Z"),
    adminUrl: "https://easy2book-new.vercel.app/admin/support",
    staleLeads: [
      {
        firstName: EVIL,
        lastName: null,
        email: `<script>x</script>@x.tn`,
        phone: null,
        updatedAt: new Date("2026-10-20T12:00:00Z"),
      } as unknown as Parameters<
        typeof buildStaleLeadsHtml
      >[0]["staleLeads"][number],
    ],
  })
  assert.doesNotMatch(html, /<img|<script/)
  assert.match(html, /&lt;img src=x/)
})
