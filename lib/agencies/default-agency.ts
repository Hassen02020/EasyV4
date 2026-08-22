/**
 * Résolution de l'agence par défaut pour les pages de vente publiques B2C.
 *
 * Les pages storefront (/transferts/resultats, etc.) n'ont pas de session
 * partenaire pour déterminer l'agence courante — le tarif et la marge
 * appliqués doivent pourtant être scopés à une agence réelle (jamais un ID
 * inventé). On résout l'agence "OTA directe" (agency_type = 'ota',
 * cf. lib/db/schema.ts) qui représente Easy2Book lui-même.
 *
 * Phase 13.2 — câblage runtime White Label : `proxy.ts` résout le host de
 * la requête en tenant (`agencies.domain`) et pose un header
 * `x-tenant-agency-id` avant que la page ne s'exécute. Cette fonction lit
 * ce header EN PRIORITÉ (via `getRequestTenantAgencyId()`) — c'est le
 * point d'entrée unique déjà utilisé par TOUTES les pages storefront
 * publiques (/omra, /packages, /attractions, listing/détail/book), donc
 * un seul changement ici les rend toutes tenant-aware sans toucher un
 * seul de ces fichiers ("Existing Product Page → Existing Booking Core"
 * inchangés). Sans tenant résolu (domaine par défaut, ou header absent
 * hors contexte requête — ex. tests), comportement strictement identique
 * à avant : recherche de l'agence OTA par défaut.
 */

import { withSystemContext } from "@/lib/db/tenant-context"
import { agencies } from "@/lib/db/schema"
import { and, eq, isNull } from "drizzle-orm"
import { getRequestTenantAgencyId, resolveEffectiveAgencyId } from "@/lib/tenant/current-tenant"

/**
 * Retourne l'ID de l'agence OTA directe, ou `null` si aucune agence de ce
 * type n'est configurée — l'appelant doit afficher une erreur claire plutôt
 * que de fabriquer un contexte de tarification.
 *
 * Trafic anonyme (pages storefront publiques) : pas de session à résoudre.
 * `withSystemContext` est sûr ici car le filtre (`agency_type = 'ota'`) est
 * fixé côté serveur, jamais influencé par une entrée utilisateur.
 *
 * `domain IS NULL` dans le fallback (Phase 13.2) : depuis que des tenants
 * White Label existent (`agency_type = 'ota'` ET `domain` renseigné, même
 * type qu'Easy2Book lui-même — voir le commentaire de `agencyType`), un
 * `LIMIT 1` sans ce filtre deviendrait non déterministe dès qu'un second
 * agent OTA existe. Le domaine par défaut (Easy2Book B2C, sans host tenant
 * résolu) ne doit jamais retomber accidentellement sur le catalogue d'un
 * tenant.
 */
export async function getDefaultAgencyId(): Promise<string | null> {
  const tenantAgencyId = await getRequestTenantAgencyId()
  // Tenant déjà résolu par proxy.ts : pas besoin d'interroger la BDD pour
  // le fallback OTA par défaut, resolveEffectiveAgencyId le préférerait de
  // toute façon.
  if (tenantAgencyId) return resolveEffectiveAgencyId(tenantAgencyId, null)

  try {
    const [agency] = await withSystemContext((db) =>
      db
        .select({ id: agencies.id })
        .from(agencies)
        .where(and(eq(agencies.agencyType, "ota"), isNull(agencies.domain)))
        .limit(1),
    )
    return resolveEffectiveAgencyId(null, agency?.id ?? null)
  } catch {
    return null
  }
}
