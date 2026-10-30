/** SITE-BRAND-THEME-01 — couleur de marque et lisibilité du texte posé dessus. */
import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import {
  ON_BRAND_DARK,
  ON_BRAND_LIGHT,
  brandColorVars,
  contrastRatio,
  onBrandColor,
} from "../brand-color"

test("contraste WCAG : valeurs de référence", () => {
  assert.equal(contrastRatio("#000000", "#ffffff").toFixed(1), "21.0")
  assert.equal(contrastRatio("#ffffff", "#ffffff").toFixed(1), "1.0")
})

test("texte blanc sur couleur foncée, texte bleu nuit sur couleur claire", () => {
  assert.equal(onBrandColor("#c8262c").color, ON_BRAND_LIGHT) // corail Easy2Book
  assert.equal(onBrandColor("#13233f").color, ON_BRAND_LIGHT)
  assert.equal(onBrandColor("#ffd60a").color, ON_BRAND_DARK) // jaune vif
  assert.equal(onBrandColor("#a7f3d0").color, ON_BRAND_DARK) // vert pâle
  // Le choix retenu est toujours le plus lisible des deux.
  for (const hex of ["#c8262c", "#ffd60a", "#808080", "#0ea5e9"]) {
    const { ratio } = onBrandColor(hex)
    assert.ok(ratio >= contrastRatio(hex, ON_BRAND_LIGHT) - 1e-9)
    assert.ok(ratio >= contrastRatio(hex, ON_BRAND_DARK) - 1e-9)
  }
})

test("variables CSS : couleur invalide ou absente → teinte par défaut", () => {
  assert.equal(brandColorVars(null), null)
  assert.equal(brandColorVars(""), null)
  assert.equal(brandColorVars("red"), null)
  assert.equal(brandColorVars("#fff"), null)
  assert.equal(brandColorVars("#12345g"), null)
  assert.equal(brandColorVars("#ffd60a; color:red"), null)
  assert.deepEqual(brandColorVars("#FFD60A"), {
    "--primary": "#ffd60a",
    "--primary-foreground": ON_BRAND_DARK,
  })
})

test("site public Easy2Book : couleur de /admin/brand appliquée sans tenant White Label", () => {
  const layout = readFileSync("app/(public)/[locale]/layout.tsx", "utf8")
  assert.match(layout, /getPublicSiteConfig\(\)\)\?\.primaryColor/)
  assert.match(layout, /primaryColor=\{primaryColor\}/)
  const shell = readFileSync("components/root-shell.tsx", "utf8")
  assert.match(shell, /brandColorVars\(primaryColor\)/)
})
