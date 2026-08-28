"use server"

/**
 * Résolution PUBLIQUE (guest, non authentifié) de la politique d'annulation
 * applicable à un produit Omra/Package/Activity — affichée avant validation
 * dans les 3 formulaires de réservation B2C (voir chaque
 * `*-guest-booking-form.tsx`).
 *
 * Même modèle de lecture publique que `app/omra/[id]/page.tsx`
 * (`getPackageWithDepartures`) : `withSystemContext` (lecture cross-agence,
 * aucune session requise) + `agencyId` résolu via `getDefaultAgencyId()` —
 * jamais une agence arbitraire, jamais les données d'une autre agence
 * exposées (une seule agence de vente directe existe pour le B2C, voir
 * lib/agencies/default-agency.ts). Réutilise
 * `resolveCancellationPolicy()` (même résolution que celle appliquée au
 * moment de la réservation) — aucune logique dupliquée.
 */

import { withSystemContext } from "@/lib/db/tenant-context"
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"
import { resolveCancellationPolicy, type PolicyProductType, type ResolvedPolicy } from "./policy-engine"

export async function getCancellationPolicyForDisplay(
  productType: PolicyProductType,
  productId: string,
): Promise<ResolvedPolicy | null> {
  const agencyId = await getDefaultAgencyId()
  if (!agencyId) return null
  return withSystemContext((tx) => resolveCancellationPolicy(tx, { agencyId, productType, productId }))
}
