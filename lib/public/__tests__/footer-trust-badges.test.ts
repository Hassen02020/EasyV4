/**
 * FOOTER-TRUST-BADGES-01 — le pied de page n'affiche aucun nom de
 * prestataire ou de fournisseur non vérifié.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

test("badges de confiance : aucune mention de prestataire en dur non vérifiée", () => {
  const src = readFileSync("components/footer-client.tsx", "utf8")
  const code = src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")
  assert.doesNotMatch(code, /APIGDS/)
  assert.doesNotMatch(code, /SPS|Monétique/)
  // Une description absente n'affiche pas de ligne vide.
  assert.match(code, /\{badge\.description \? \(/)
})
