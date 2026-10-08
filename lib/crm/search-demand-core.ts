/**
 * BEHAVIORAL-SIGNAL-01 — signal de DEMANDE MARCHÉ agrégé (destination +
 * produit + jour), PAS un historique individuel.
 *
 * Décisions produit actées avec l'utilisateur (docs/ROADMAP.md,
 * BEHAVIORAL-INTENT-01/BEHAVIORAL-SIGNAL-01) :
 *  - AUCUN tracking individuel, aucune IP, aucun fingerprint, aucun
 *    identifiant de visiteur — `recordHotelSearchDemandCore` incrémente un
 *    COMPTEUR partagé (agencyId, productType, destination, searchDate),
 *    jamais une ligne par recherche.
 *  - "pilote" strictement limité au produit hôtel ("hotel") pour ce
 *    chantier — pas une plateforme générique d'événements comportementaux.
 *    Un futur second produit (vols, omra...) serait un EXTEND explicite de
 *    ce fichier, jamais une duplication.
 *  - Jamais fusionné avec VIP Score (valeur client, lib/crm/vip-score-core.ts)
 *    ni NICHE (segmentation, lib/crm/niche-core.ts) — ce signal mesure la
 *    demande marché, pas une personne. Aucune lecture/écriture croisée
 *    avec ces deux fichiers ici.
 *  - Jamais bloquant pour une vraie recherche hôtel : l'appelant (route
 *    API publique) doit toujours wrapper cet appel dans un try/catch qui
 *    avale l'erreur — enregistrer un signal de demande ne doit jamais
 *    faire échouer une recherche réelle (même discipline que
 *    `acquireLock`, lib/booking/inventory.ts).
 */

import { sql } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import { searchDemandSignals } from "@/lib/db/schema"

/** Seul produit instrumenté pour ce pilote — jamais un second vocabulaire. */
export const SEARCH_DEMAND_PILOT_PRODUCT_TYPE = "hotel" as const

function toUtcDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/**
 * Incrémente le compteur de demande pour (agencyId, "hotel", destination,
 * aujourd'hui en UTC) — upsert idempotent, jamais une ligne par recherche.
 * `destination` doit déjà être une valeur canonique (ex.
 * `destinationByValue(...).value`, lib/hotels-monde/search-state.ts),
 * jamais un libellé localisé.
 */
export async function recordHotelSearchDemandCore(
  tx: DrizzleTransaction,
  params: { agencyId: string; destination: string; now?: Date },
): Promise<void> {
  const searchDate = toUtcDateOnly(params.now ?? new Date())
  const now = params.now ?? new Date()

  await tx
    .insert(searchDemandSignals)
    .values({
      agencyId: params.agencyId,
      productType: SEARCH_DEMAND_PILOT_PRODUCT_TYPE,
      destination: params.destination,
      searchDate,
      searchCount: 1,
    })
    .onConflictDoUpdate({
      target: [
        searchDemandSignals.agencyId,
        searchDemandSignals.productType,
        searchDemandSignals.destination,
        searchDemandSignals.searchDate,
      ],
      set: {
        searchCount: sql`${searchDemandSignals.searchCount} + 1`,
        updatedAt: now,
      },
    })
}
