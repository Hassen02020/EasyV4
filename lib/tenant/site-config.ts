import "server-only"

/**
 * Informations de contact de l'agence courante (téléphone, WhatsApp, réseaux
 * sociaux, adresse) — utilisées par les composants publics (header, footer,
 * carte de réservation) pour remplacer les valeurs codées en dur.
 *
 * Résolution :
 *   1. Si `agencyId` fourni (tenant White Label résolu par proxy.ts) → lit
 *      directement l'agence désignée.
 *   2. Sinon → cherche l'agence OTA par défaut (domain IS NULL), identique
 *      à `getDefaultAgencyId()` dans lib/agencies/default-agency.ts.
 *
 * `withSystemContext` (bypass RLS via GUC `app.is_super_admin`) est justifié
 * ici pour la même raison que dans proxy.ts / resolveTenantForHost() : un
 * visiteur anonyme du storefront n'a ni session ni agence courante — seules
 * des colonnes publiques par nature sont sélectionnées (téléphone, adresse,
 * URLs réseaux sociaux — jamais deposit_balance, matricule_fiscale, etc.).
 */

import { and, asc, eq, isNull } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import { agencies } from "@/lib/db/schema"

export interface SiteContactInfo {
  contactPhone: string | null
  whatsappNumber: string | null
  facebookUrl: string | null
  instagramUrl: string | null
  tiktokUrl: string | null
  address: string | null
}

/**
 * Retourne les informations de contact de l'agence courante, ou `null` si la
 * BDD est inaccessible. Ne lève jamais — les composants affichent un fallback
 * vide plutôt que de planter le rendu.
 */
export async function getSiteContactInfo(
  agencyId?: string | null,
): Promise<SiteContactInfo | null> {
  try {
    const rows = await withSystemContext((db) => {
      if (agencyId) {
        return db
          .select({
            contactPhone: agencies.contactPhone,
            whatsappNumber: agencies.whatsappNumber,
            facebookUrl: agencies.facebookUrl,
            instagramUrl: agencies.instagramUrl,
            tiktokUrl: agencies.tiktokUrl,
            address: agencies.address,
          })
          .from(agencies)
          .where(eq(agencies.id, agencyId))
          .limit(1)
      }
      // Fallback OTA par défaut (Easy2Book lui-même — domain IS NULL)
      return db
        .select({
          contactPhone: agencies.contactPhone,
          whatsappNumber: agencies.whatsappNumber,
          facebookUrl: agencies.facebookUrl,
          instagramUrl: agencies.instagramUrl,
          tiktokUrl: agencies.tiktokUrl,
          address: agencies.address,
        })
        .from(agencies)
        .where(and(eq(agencies.agencyType, "ota"), isNull(agencies.domain)))
        .orderBy(asc(agencies.createdAt))
        .limit(1)
    })

    const row = rows[0]
    if (!row) return null
    return {
      contactPhone: row.contactPhone ?? null,
      whatsappNumber: row.whatsappNumber ?? null,
      facebookUrl: row.facebookUrl ?? null,
      instagramUrl: row.instagramUrl ?? null,
      tiktokUrl: row.tiktokUrl ?? null,
      address: row.address ?? null,
    }
  } catch {
    return null
  }
}
