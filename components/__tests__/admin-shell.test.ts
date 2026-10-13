/**
 * Tests de logique pure (pas de rendu React) pour `components/admin-shell.tsx`
 * — trouvé en QA visuelle (2026-10-13) : `/admin/suppliers/nodes` (module
 * Network) n'avait jamais eu de lien de navigation, et le fil d'Ariane
 * affichait un UUID brut pour tout segment `[id]` dynamique.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { getBreadcrumb, getNavItems } from "../admin-shell"

test("getBreadcrumb : nomme correctement 'nodes' et 'settlements' (jamais 'Nodes'/'Settlements' bruts)", () => {
  const crumbs = getBreadcrumb(
    "/admin/suppliers/nodes/6406c7d9-40fe-4803-9ed6-da0c20a9a3af/settlements",
  )
  const labels = crumbs.map((c) => c.label)
  assert.ok(
    labels.includes("Nœuds fournisseurs"),
    `attendu "Nœuds fournisseurs" dans ${JSON.stringify(labels)}`,
  )
  assert.ok(
    labels.includes("Règlements"),
    `attendu "Règlements" dans ${JSON.stringify(labels)}`,
  )
})

test("getBreadcrumb : masque le segment UUID brut, jamais affiché tel quel", () => {
  const crumbs = getBreadcrumb(
    "/admin/suppliers/nodes/6406c7d9-40fe-4803-9ed6-da0c20a9a3af/settlements",
  )
  const labels = crumbs.map((c) => c.label)
  assert.ok(
    !labels.some((l) => /^[0-9a-f-]{36}$/i.test(l)),
    `un UUID brut ne doit jamais apparaître comme miette : ${JSON.stringify(labels)}`,
  )
  // Le href de l'étape suivante ("Règlements") doit rester l'URL réelle et
  // complète (UUID inclus) — seul le RENDU de la miette UUID est sauté, pas
  // la navigation.
  const settlementsCrumb = crumbs.find((c) => c.label === "Règlements")
  assert.equal(
    settlementsCrumb?.href,
    "/admin/suppliers/nodes/6406c7d9-40fe-4803-9ed6-da0c20a9a3af/settlements",
  )
})

test("getBreadcrumb : un UUID n'importe où dans le chemin est masqué, pas seulement pour /admin/suppliers/nodes (générique, pas une règle spécifique à cette route)", () => {
  const crumbs = getBreadcrumb(
    "/admin/agencies/11111111-2222-3333-4444-555555555555",
  )
  const labels = crumbs.map((c) => c.label)
  assert.deepEqual(labels, ["Admin", "Agences"])
})

test("getBreadcrumb : une route sans UUID n'est jamais affectée (pas de régression sur les ~25 autres segments déjà mappés)", () => {
  const crumbs = getBreadcrumb("/admin/accounting/settlements")
  assert.deepEqual(
    crumbs.map((c) => c.label),
    ["Admin", "Comptabilité", "Règlements"],
  )
})

test("getNavItems('super_admin') : contient un lien vers /admin/suppliers/nodes", () => {
  const items = getNavItems("super_admin")
  const fournisseurs = items.find((i) => i.title === "Fournisseurs")
  assert.ok(fournisseurs, "item 'Fournisseurs' manquant pour super_admin")
  const nodeLink = fournisseurs!.subItems?.find(
    (s) => s.href === "/admin/suppliers/nodes",
  )
  assert.ok(
    nodeLink,
    "sous-item vers /admin/suppliers/nodes manquant sous 'Fournisseurs'",
  )
})

test("getNavItems : /admin/suppliers/nodes n'est visible pour AUCUN rôle non-super_admin (visibilité réservée au Super Admin)", () => {
  const roles = [
    "manager",
    "agent_resa",
    "agent_compta",
    "agent_excursions",
  ] as const
  for (const role of roles) {
    const items = getNavItems(role)
    const hasNodeLink = items.some(
      (i) =>
        i.href === "/admin/suppliers/nodes" ||
        i.subItems?.some((s) => s.href === "/admin/suppliers/nodes"),
    )
    assert.equal(
      hasNodeLink,
      false,
      `le rôle "${role}" ne doit jamais voir le lien /admin/suppliers/nodes`,
    )
  }
})
