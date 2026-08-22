/**
 * Décision pure "quel agencyId utiliser" (Phase 13.2) — zéro dépendance,
 * extraite de `current-tenant.ts` pour rester testable sans `server-only`
 * ni `next/headers` (qui ont besoin d'un vrai contexte requête Next.js et
 * cassent sous le runner de test node:test/tsx de ce repo — même raison
 * que `lib/tenant/host.ts`/`lib/admin/product-constants.ts`).
 */

/**
 * Le tenant résolu pour cette requête (prioritaire) sinon le fallback
 * (agence OTA par défaut).
 */
export function resolveEffectiveAgencyId(
  tenantHeaderAgencyId: string | null | undefined,
  fallbackAgencyId: string | null,
): string | null {
  if (tenantHeaderAgencyId && tenantHeaderAgencyId.trim()) {
    return tenantHeaderAgencyId.trim()
  }
  return fallbackAgencyId
}
