/**
 * LEGAL-DATA-DELETION-01 — page de suppression des données exigée par Meta.
 * Les informations validées par la direction (2026-10-31) apparaissent dans
 * les trois langues, sans aucune valeur inventée ; la page est reliée au
 * pied de page, au plan du site et à la politique de confidentialité.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { DATA_DELETION, dataDeletionContent } from "../data-deletion-content"

const src = (rel: string) => readFileSync(rel, "utf8")
const text = (locale: string) => {
  const c = dataDeletionContent(locale)
  return [
    c.title,
    c.notice,
    c.intro,
    ...c.sections.flatMap((s) => s.paragraphs),
  ].join("\n")
}

test("informations validées par la direction, telles que fournies", () => {
  assert.deepEqual(DATA_DELETION, {
    controller: "SUARL Easy2Book",
    address: "28 avenue de Bizerte, 6100 Siliana, Tunisie",
    email: "Direction@easy2book.tn",
    handler: "M. Hassen Tarhouni",
    maxDays: 5,
    invoiceRetention: "1 an",
    lastUpdated: "2026-10-31",
  })
})

test("FR / EN / AR : responsable, email de demande, délai et confirmation présents", () => {
  for (const locale of ["fr", "en", "ar"]) {
    const t = text(locale)
    assert.match(t, /SUARL Easy2Book/, locale)
    assert.ok(t.split("Direction@easy2book.tn").length - 1 >= 3, locale)
    assert.match(t, /\b5\b/, locale)
    assert.equal(dataDeletionContent(locale).sections.length, 8, locale)
  }
  assert.match(text("fr"), /6100 Siliana/)
  assert.match(text("fr"), /M\. Hassen Tarhouni/)
  assert.match(text("fr"), /conservées pendant 1 an/)
  assert.match(text("en"), /kept for 1 year/)
  assert.match(text("en"), /Mr Hassen Tarhouni/)
  assert.match(text("ar"), /سليانة/)
  // Locale inconnue → français.
  assert.equal(dataDeletionContent("de").title, dataDeletionContent("fr").title)
})

test("aucun texte de remplissage ni ancienne adresse de demande", () => {
  for (const locale of ["fr", "en", "ar"]) {
    assert.doesNotMatch(
      text(locale),
      /lorem|ipsum|à confirmer|à compléter|info@/i,
    )
  }
})

test("page reliée : pied de page, plan du site, politique de confidentialité, 3 langues", () => {
  assert.match(
    src("components/footer-client.tsx"),
    /href="\/suppression-donnees"/,
  )
  assert.match(src("app/sitemap.ts"), /"\/suppression-donnees"/)
  assert.match(
    src("app/(public)/[locale]/politique-confidentialite/page.tsx"),
    /Direction@easy2book\.tn[\s\S]*Suppression des données/,
  )
  for (const l of ["fr", "en", "ar"]) {
    const common = JSON.parse(src(`messages/${l}.json`)).Common
    assert.ok(common.suppressionDonnees, l)
  }
})
