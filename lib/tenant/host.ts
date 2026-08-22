/**
 * Normalisation de host — zéro dépendance, sûr à importer depuis
 * `proxy.ts` (Edge runtime).
 *
 * Extrait de `resolve-tenant.ts` (Phase 13.1) dans son propre fichier pour
 * la même raison que `lib/admin/product-constants.ts` (Phase 13) : un
 * fichier importé par du code Edge/client ne doit jamais aussi exporter du
 * code server-only (ici, `resolve-tenant.ts::resolveTenantByDomain` importe
 * Drizzle/postgres, qui casse le build Edge s'il est tiré dans le bundle
 * `proxy.ts` — bug déjà rencontré et corrigé une fois en Phase 13
 * (`lib/admin/product-guard.ts`), pas répété ici.
 */

export function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/^www\./, "").replace(/:\d+$/, "")
}
