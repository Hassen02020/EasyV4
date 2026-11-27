import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

// UI-LOT3 — panier / réservation : couleurs fonctionnelles via tokens,
// badge de statut commun, pas de texte < 12 px. Affichage seulement.
const FILES = [
  "components/booking-summary-card.tsx",
  "components/booking/checkout-form.tsx",
  "components/cart/cart-view.tsx",
]
const RAW =
  /(bg|text|border|ring)-(red|green|amber|yellow|blue|emerald|orange|gray|slate|zinc|rose|sky)-\d{2,3}/g

test("aucune couleur Tailwind brute fonctionnelle (exception : étoile de notation)", () => {
  for (const f of FILES) {
    const src = readFileSync(f, "utf8").replace(
      "h-6 w-6 fill-amber-400 text-amber-400",
      "",
    )
    assert.deepEqual(src.match(RAW) ?? [], [], f)
  }
})

test("pas de texte sous 12 px", () => {
  for (const f of FILES) {
    const src = readFileSync(f, "utf8")
    assert.equal(/text-\[(\d|1[01])px\]/.test(src), false, f)
  }
})

test("le résumé de réservation réutilise StatusBadge et le mapping de ton", () => {
  const src = readFileSync("components/booking-summary-card.tsx", "utf8")
  assert.match(src, /from "@\/components\/ui\/status-badge"/)
  assert.match(src, /confirmationStatusTone\(status\)/)
  assert.equal(/function StatusBadge\(/.test(src), false)
})
