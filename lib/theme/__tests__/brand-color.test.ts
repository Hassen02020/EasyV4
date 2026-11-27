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

/** UI-LOT2B — espace agence : même règle que le site public, teintes dérivées incluses. */
test("espace agence : brandColorVars (texte lisible) et portée des teintes dérivées", () => {
  const layout = readFileSync("components/pro/layout.tsx", "utf8")
  assert.match(layout, /brandColorVars\(agency\.primaryColor\)/)
  assert.match(layout, /data-brand-scope/)
  // Plus d'injection de --primary seul (texte des boutons non adapté).
  assert.doesNotMatch(layout, /\{ "--primary": /)
  const css = readFileSync("app/globals.css", "utf8")
  for (const t of [
    "--primary-hover",
    "--primary-pressed",
    "--primary-soft",
    "--ring",
  ]) {
    const scoped = css.match(/\[data-brand-scope\]\s*\{[^}]*\}/)
    assert.ok(
      scoped && scoped[0].includes(t),
      `${t} absent de [data-brand-scope]`,
    )
  }
  assert.match(css, /\.dark \[data-brand-scope\]/)
})

test("couleur d'agence claire : texte de bouton bleu nuit, jamais blanc", () => {
  const vars = brandColorVars("#ffd60a")
  assert.ok(vars)
  assert.equal(vars["--primary-foreground"], ON_BRAND_DARK)
  assert.ok(contrastRatio("#ffd60a", vars["--primary-foreground"]) >= 4.5)
})
