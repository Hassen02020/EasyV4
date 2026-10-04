/**
 * J5 CRM→Supplier — moteur de résolution lead ↔ supplier_node.
 *
 * Deux chemins de résolution, du plus direct au plus indirect :
 *   1. `lead.supplier_node_id` (renseigné à la soumission si productRef est
 *      un UUID de la table products avec un supplier_node_id connu).
 *   2. `lead.reservation_id` → `reservation_network_product.supplier_node_id`
 *      (après conversion, si la réservation est un produit Network).
 *
 * `null` pour les leads classiques (hotel myGo, vol, etc.) : le fournisseur
 * n'est pas modélisé dans le Network — comportement attendu, jamais une erreur.
 */

import { and, eq, desc } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import { leads, reservationNetworkProduct, supplierNodes } from "@/lib/db/schema"
import type { LeadRow } from "./leads-core"

export interface SupplierNodeInfo {
  id: string
  displayName: string
  supplierId: string
  slug: string
}

/**
 * Résout le supplier_node associé à un lead, en deux passes :
 *   1. Via `lead.supplier_node_id` (champ direct, J5).
 *   2. Via la réservation liée → `reservation_network_product`.
 * Retourne `null` si aucune information fournisseur n'est disponible.
 */
export async function resolveLeadSupplierCore(
  tx: DrizzleTransaction,
  lead: Pick<LeadRow, "supplierNodeId" | "reservationId">,
): Promise<SupplierNodeInfo | null> {
  // Chemin 1 : lien direct renseigné à la soumission
  if (lead.supplierNodeId) {
    const [node] = await tx
      .select({
        id: supplierNodes.id,
        displayName: supplierNodes.displayName,
        supplierId: supplierNodes.supplierId,
        slug: supplierNodes.slug,
      })
      .from(supplierNodes)
      .where(eq(supplierNodes.id, lead.supplierNodeId))
      .limit(1)
    if (node) return node
  }

  // Chemin 2 : résolution via la réservation Network liée
  if (lead.reservationId) {
    const [rnp] = await tx
      .select({ supplierNodeId: reservationNetworkProduct.supplierNodeId })
      .from(reservationNetworkProduct)
      .where(eq(reservationNetworkProduct.reservationId, lead.reservationId))
      .limit(1)
    if (rnp?.supplierNodeId) {
      const [node] = await tx
        .select({
          id: supplierNodes.id,
          displayName: supplierNodes.displayName,
          supplierId: supplierNodes.supplierId,
          slug: supplierNodes.slug,
        })
        .from(supplierNodes)
        .where(eq(supplierNodes.id, rnp.supplierNodeId))
        .limit(1)
      if (node) return node
    }
  }

  return null
}

/**
 * Tous les leads liés à un supplier_node donné, du plus récent au plus ancien.
 * Limité à 200 — suffisant pour le volume Network attendu en phase pilot.
 */
export async function listLeadsBySupplierCore(
  tx: DrizzleTransaction,
  params: { supplierNodeId: string; limit?: number },
): Promise<LeadRow[]> {
  const rows = await tx
    .select()
    .from(leads)
    .where(eq(leads.supplierNodeId, params.supplierNodeId))
    .orderBy(desc(leads.createdAt))
    .limit(params.limit ?? 200)

  return rows.map((r) => ({
    ...r,
    productType: r.productType as LeadRow["productType"],
    status: r.status as LeadRow["status"],
    supplierNodeId: r.supplierNodeId ?? null,
  }))
}
