import "server-only"

/**
 * Lecture, côté Node (Server Component / Server Action), du tenant déjà
 * résolu par `proxy.ts` pour la requête courante (Phase 13.2).
 *
 * `proxy.ts` (Edge runtime) résout le host et pose le header
 * `x-tenant-agency-id` (+ `x-tenant-domain`/`x-tenant-brand-name` pour un
 * usage futur d'affichage) AVANT que la requête n'atteigne le rendu de
 * page — ce fichier ne fait AUCUNE nouvelle résolution, il lit seulement
 * ce que `proxy.ts` a déjà validé (host trouvé dans `agencies.domain`,
 * agence `status = 'active'`). Aucune valeur ici ne vient jamais
 * directement du client — `headers()` expose les headers de la requête
 * HTTP telle que `proxy.ts` l'a laissée passer, pas un header que le
 * navigateur pourrait usurper indépendamment (Next.js ne permet pas à une
 * requête entrante de définir un header interne `x-tenant-*` qui
 * survivrait à la réécriture de `proxy.ts`).
 */

import { headers } from "next/headers"
import { resolveEffectiveAgencyId } from "./effective-agency"

export { resolveEffectiveAgencyId }

export const TENANT_AGENCY_ID_HEADER = "x-tenant-agency-id"
export const TENANT_DOMAIN_HEADER = "x-tenant-domain"
export const TENANT_BRAND_NAME_HEADER = "x-tenant-brand-name"

/** Agence tenant résolue pour la requête courante par `proxy.ts`, ou `null` (domaine par défaut). */
export async function getRequestTenantAgencyId(): Promise<string | null> {
  try {
    const h = await headers()
    const value = h.get(TENANT_AGENCY_ID_HEADER)
    return value && value.trim() ? value.trim() : null
  } catch {
    return null
  }
}

export interface RequestTenantInfo {
  agencyId: string
  domain: string
  brandName: string | null
}

/** Infos tenant complètes (agencyId + domain + brandName) pour la requête courante, ou `null`. */
export async function getRequestTenantInfo(): Promise<RequestTenantInfo | null> {
  try {
    const h = await headers()
    const agencyId = h.get(TENANT_AGENCY_ID_HEADER)
    if (!agencyId) return null
    return {
      agencyId,
      domain: h.get(TENANT_DOMAIN_HEADER) ?? "",
      brandName: h.get(TENANT_BRAND_NAME_HEADER) || null,
    }
  } catch {
    return null
  }
}
