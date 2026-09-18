/**
 * PHASE PREMIUM 2 — Chantier 5 (Cross-sell par destination).
 *
 * `getCrossSellPackages`/`getCrossSellActivities` (lib/destinations/cross-sell.ts)
 * passent par `getDefaultAgencyId()` (lib/agencies/default-agency.ts →
 * lib/tenant/current-tenant.ts, qui porte `import "server-only"`). Ce garde
 * lève systématiquement hors du bundler Next.js (résolution normale de
 * `node:test`/tsx) — même contrainte, déjà présente avant ce chantier, sur
 * `getActivePackages` (`app/(public)/[locale]/packages/page.tsx`) et
 * `getPublishedActivities` (`app/(public)/[locale]/attractions/page.tsx`),
 * ni l'une ni l'autre couvertes par une suite DB-mode dans ce dépôt — donc
 * pas de régression de couverture introduite ici. Seule la partie pure et
 * déterministe de ce module (le mapping `packages_slug`) est testée
 * automatiquement ; `getCrossSellPackages`/`getCrossSellActivities`
 * eux-mêmes sont vérifiés par QA navigateur réelle (voir rapport de
 * chantier 5), comme le reste de cette famille de fonctions.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { PACKAGE_DESTINATION_SEARCH_TERMS } from "@/lib/destinations/package-search-terms"

test("PACKAGE_DESTINATION_SEARCH_TERMS couvre exactement les 8 destinations packages_slug du seed (chantier 3)", () => {
  const keys = Object.keys(PACKAGE_DESTINATION_SEARCH_TERMS).sort()
  assert.deepEqual(keys, [
    "barcelona",
    "cairo",
    "casablanca",
    "dubai",
    "istanbul",
    "london",
    "paris",
    "rome",
  ])
})

test("PACKAGE_DESTINATION_SEARCH_TERMS n'a aucune valeur vide (jamais un ILIKE '%%' qui matcherait tout)", () => {
  for (const term of Object.values(PACKAGE_DESTINATION_SEARCH_TERMS)) {
    assert.ok(term.length > 0)
  }
})
