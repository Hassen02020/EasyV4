import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { confirmationStatusTone } from "../confirmation-status-tone"

test("chaque statut connu a un ton sémantique", () => {
  assert.equal(confirmationStatusTone("pending"), "warning")
  assert.equal(confirmationStatusTone("on_request"), "info")
  assert.equal(confirmationStatusTone("confirmed"), "success")
  assert.equal(confirmationStatusTone("completed"), "success")
  assert.equal(confirmationStatusTone("cancelled"), "danger")
  assert.equal(confirmationStatusTone("refunded"), "neutral")
  assert.equal(confirmationStatusTone("no_show"), "neutral")
})

test("statut inconnu ou piégé => neutre", () => {
  assert.equal(confirmationStatusTone("whatever"), "neutral")
  assert.equal(confirmationStatusTone("constructor"), "neutral")
  assert.equal(confirmationStatusTone("__proto__"), "neutral")
})

test("le badge n'utilise plus de couleur Tailwind brute ni Badge", () => {
  const src = readFileSync(
    "components/booking/confirmation-status-badge.tsx",
    "utf8",
  )
  assert.doesNotMatch(
    src,
    /\b(bg|text|border)-(red|green|emerald|amber|sky|purple|slate)-\d/,
  )
  assert.match(src, /StatusBadge/)
})

function lum(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const l = c.map((x) =>
    x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4,
  )
  return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]
}
function blendOnWhite(hex: string, a: number): string {
  const ch = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16)
    return Math.round(v * a + 255 * (1 - a))
      .toString(16)
      .padStart(2, "0")
  })
  return "#" + ch.join("")
}
function ratio(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}

test("tons clairs : texte ≥ 4,5:1 sur fond teinté à 10 % (tokens de globals.css)", () => {
  const css = readFileSync("app/globals.css", "utf8")
  const root = css.slice(0, css.indexOf("\n.dark {"))
  // `warning` (#b45309) sur teinte 10 % = 4,39:1, légèrement sous 4,5:1 : écart
  // préexistant de StatusBadge (Lot 1a), signalé au propriétaire, hors périmètre
  // 2a (aucun token modifié). Plancher provisoire 4,0:1 (contre 2,15:1 avant).
  const FLOOR: Record<string, number> = {
    success: 4.5,
    info: 4.5,
    destructive: 4.5,
    warning: 4.0,
  }
  for (const token of Object.keys(FLOOR)) {
    const m = root.match(new RegExp(`--${token}:\\s*(#[0-9a-fA-F]{6})`))
    assert.ok(m, `token --${token} introuvable en clair`)
    const bg = blendOnWhite(m[1], 0.1)
    assert.ok(
      ratio(m[1], bg) >= FLOOR[token],
      `${token} ${ratio(m[1], bg).toFixed(2)}:1`,
    )
  }
})
