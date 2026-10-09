/**
 * BUG-ACT-01 — invariants statiques sur le câblage financier du module
 * Activités (guest-booking-actions.ts).
 *
 * Contexte : BUG-ACT-01 auditait la possibilité que `supplierPriceTnd ===
 * salePriceTnd` soit un bug de câblage. L'audit du code source confirme que
 * c'est INTENTIONNEL — les activités sont un catalogue PROPRE à l'agence,
 * sans fournisseur externe modélisé (même modèle que Cars). Il n'existe donc
 * aucun « coût net fournisseur » séparé à distinguer du prix de vente.
 * Conséquence : `commissionPercent` n'est pas passé → commission = 0, ce qui
 * est correct (aucune commission Easy2Book n'est appliquée sur un catalogue
 * interne sans règle System-B configurée).
 *
 * Ces tests documentent ET protègent cet invariant contre une régression
 * involontaire (quelqu'un qui passerait un coût fournisseur inventé à 0).
 *
 * Pattern readFileSync (même discipline que lib/cars/__tests__/
 * reservation-financials-wiring.test.ts) : `"use server"` empêche
 * d'importer le fichier directement sous `node --test`.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const src = readFileSync(
  join(ROOT, "lib/activities/guest-booking-actions.ts"),
  "utf8",
)

test("BUG-ACT-01 : supplierPriceTnd passe totalTnd (catalogue propre = pas de coût fournisseur externe séparé)", () => {
  // R6-02 : activités = catalogue agence, pas d'API fournisseur externe.
  // supplierPriceTnd est donc ≡ salePriceTnd ≡ totalTnd — pas un bug.
  assert.match(src, /supplierPriceTnd:\s*totalTnd,/)
  assert.match(src, /salePriceTnd:\s*totalTnd,/)
})

test("BUG-ACT-01 : creditPlatformCommission est appelé après recordReservationFinancials (commissionAmount destructuré)", () => {
  // Même si la commission est 0 (pas de commissionPercent), l'appel doit
  // exister pour maintenir la cohérence du flux financier et permettre une
  // future activation sans refactoring.
  assert.match(
    src,
    /const\s*\{[^}]*commissionAmount[^}]*\}\s*=\s*await\s+recordReservationFinancials\(/,
  )
  assert.match(
    src,
    /await creditPlatformCommission\(tx,\s*\{[\s\S]*?commissionAmount,/,
  )
})
