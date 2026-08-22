/**
 * Routes exemptées de la résolution tenant White Label (Phase 13.2) —
 * zéro dépendance, extrait de `proxy.ts` pour rester testable (importer
 * `proxy.ts` directement tirerait `next/headers`/`@supabase/ssr`, qui ont
 * besoin d'un contexte requête réel).
 *
 * `/admin` (OTA), `/pro` (agences B2B), `/mutuelle` et `/api` ne sont
 * jamais un storefront tenant — sauter la résolution ici évite un
 * aller-retour BDD inutile sur chaque requête de ces zones.
 */
export const TENANT_EXEMPT_ROUTES = /^\/(admin|pro|api|mutuelle)(\/|$)/

export function isTenantExemptRoute(pathname: string): boolean {
  return TENANT_EXEMPT_ROUTES.test(pathname)
}
