/** UI-LOT1B — en-tête lisible en sombre, indice de recherche i18n, badge de statut partagé. */
import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { contrastRatio } from "../brand-color"

const css = readFileSync("app/globals.css", "utf8")

test("--brand-ink : lisible en clair (sur blanc) et en sombre (sur fond nuit)", () => {
  assert.match(css, /--brand-ink:\s*#002a5c/)
  assert.match(css, /--brand-ink:\s*#9cc2f5/)
  assert.match(css, /--color-brand-ink:\s*var\(--brand-ink\)/)
  assert.ok(contrastRatio("#002a5c", "#ffffff") >= 4.5)
  assert.ok(contrastRatio("#9cc2f5", "#0b1b33") >= 4.5)
})

test("en-tête public : plus de text-sidebar (invisible en sombre)", () => {
  for (const f of [
    "components/header.tsx",
    "components/language-switcher.tsx",
    "components/currency-switcher.tsx",
    "components/cart/cart-badge-link.tsx",
  ]) {
    assert.doesNotMatch(readFileSync(f, "utf8"), /text-sidebar\b/, f)
  }
})

test("indice de recherche : clé présente et non vide en fr/en/ar", () => {
  for (const l of ["fr", "en", "ar"]) {
    const m = JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))
    assert.ok(m.Hotels.searchHint && m.Hotels.searchHint.length > 10, l)
  }
  const src = readFileSync("components/hotels-tunisie-search.tsx", "utf8")
  assert.match(src, /aria-describedby=\{!isFormValid/)
})

test("tableau admin : badge partagé, statuts inchangés ; texte sur teinte jamais blanc", () => {
  const t = readFileSync("components/admin/reservations-data-table.tsx", "utf8")
  assert.match(t, /from "@\/components\/ui\/status-badge"/)
  for (const s of [
    "pending",
    "on_request",
    "confirmed",
    "cancelled",
    "no_show",
    "completed",
    "refunded",
    "expired",
  ]) {
    assert.match(
      t,
      new RegExp(`${s}: "(warning|info|success|danger|neutral)"`),
      s,
    )
  }
  // régression Lot 1a : warning-foreground est blanc (fond plein), interdit comme texte
  assert.doesNotMatch(t, /text-warning-foreground/)
})
