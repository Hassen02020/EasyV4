/** UI-LOT1A — tokens de marque (#003878), contrastes, White Label préservé. */
import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { brandColorVars, contrastRatio } from "../brand-color"

const css = readFileSync("app/globals.css", "utf8")
const root = css.slice(css.indexOf(":root {"), css.indexOf(".dark {"))
const dark = css.slice(css.indexOf(".dark {"), css.indexOf("@theme inline"))

test("--primary = bleu Easy2Book #003878 (clair), plus de corail d'action", () => {
  assert.match(root, /--primary:\s*#003878;/)
  assert.doesNotMatch(root, /--primary:\s*oklch\(0\.55 0\.21 25\)/)
  assert.doesNotMatch(dark, /--primary:\s*oklch\(0\.65 0\.19 25\)/)
  assert.match(root, /--ring:\s*var\(\s*--primary\s*\)/)
})

test("fond jasmin et or décoratif conservés", () => {
  assert.match(root, /--background:\s*oklch\(0\.985 0\.005 85\)/)
  assert.match(root, /--accent:\s*oklch\(0\.78 0\.13 60\)/)
})

test("contrastes WCAG AA (≥ 4,5) des paires de tokens clairs", () => {
  const pairs: Array<[string, string]> = [
    ["#003878", "#ffffff"],
    ["#b91c1c", "#ffffff"],
    ["#047857", "#ffffff"],
    ["#b45309", "#ffffff"],
    ["#0b5cad", "#ffffff"],
    ["#6b7280", "#ffffff"],
    ["#6aa5f0", "#0b1b33"], // primaire sombre
    ["#ef6b6b", "#0b1b33"], // destructif sombre
  ]
  for (const [a, b] of pairs) {
    assert.ok(
      contrastRatio(a, b) >= 4.5,
      `${a} / ${b} = ${contrastRatio(a, b)}`,
    )
  }
  assert.equal(contrastRatio("#003878", "#ffffff").toFixed(2), "11.43")
})

test("White Label : la couleur d'agence surcharge toujours --primary", () => {
  assert.deepEqual(brandColorVars("#0A7A3C"), {
    "--primary": "#0a7a3c",
    "--primary-foreground": "#ffffff",
  })
  // les dérivés (hover/pressed/soft) et le focus suivent --primary
  assert.match(root, /--primary-hover:\s*color-mix\(in oklab, var\(--primary\)/)
  assert.match(root, /--primary-soft:\s*color-mix\(in oklab, var\(--primary\)/)
})

test("themeColor navigateur = #003878 ; police arabe branchée", () => {
  const layout = readFileSync("app/(public)/[locale]/layout.tsx", "utf8")
  assert.match(layout, /themeColor:\s*"#003878"/)
  const shell = readFileSync("components/root-shell.tsx", "utf8")
  assert.match(shell, /Noto_Sans_Arabic/)
  assert.match(css, /:lang\(ar\) body/)
})
