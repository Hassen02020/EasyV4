/**
 * Logique transactionnelle pure du Media System — extraite de
 * lib/admin/product-media-actions.ts pour être testable indépendamment de
 * la garde d'autorisation (`assertProductManager`, qui a besoin d'une
 * session Supabase réelle). Même convention que lib/admin/
 * inventory-locks-core.ts : le "-core" porte la logique, le fichier
 * "use server" porte l'auth + les server actions.
 *
 * Pas de marqueur `import "server-only"` : ce module ne porte aucun secret
 * (uniquement des requêtes Drizzle sur une transaction fournie par
 * l'appelant) — testable directement via `node --test`
 * (lib/media/__tests__/media-core.test.ts). Voir la même note dans
 * lib/media/optimize.ts.
 */

import { and, eq, inArray } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import { productMedia, type ProductMedia } from "@/lib/db/schema"
import type { ProductMediaModule } from "@/lib/admin/product-constants"

/** Galerie complète d'un produit, dans l'ordre d'affichage (mission §18). Lignes brutes — l'appelant (lib/media/query.ts) résout les URLs Storage. */
export async function fetchProductMediaRows(
  tx: DrizzleTransaction,
  agencyId: string,
  module: ProductMediaModule,
  productId: string,
): Promise<ProductMedia[]> {
  return tx
    .select()
    .from(productMedia)
    .where(
      and(
        eq(productMedia.agencyId, agencyId),
        eq(productMedia.module, module),
        eq(productMedia.productId, productId),
      ),
    )
    .orderBy(productMedia.sortOrder)
}

/**
 * Couverture de plusieurs produits en une seule requête (pages liste —
 * évite le N+1 sur une grille de cartes). Ne renvoie que les produits ayant
 * une couverture ; l'appelant applique le fallback legacy/générique pour
 * les autres (mission §23/§24).
 */
export async function fetchCoverMediaRows(
  tx: DrizzleTransaction,
  agencyId: string,
  module: ProductMediaModule,
  productIds: string[],
): Promise<ProductMedia[]> {
  if (productIds.length === 0) return []
  return tx
    .select()
    .from(productMedia)
    .where(
      and(
        eq(productMedia.agencyId, agencyId),
        eq(productMedia.module, module),
        inArray(productMedia.productId, productIds),
        eq(productMedia.isCover, true),
      ),
    )
}

/**
 * Après suppression d'un média qui était couverture : promeut le premier
 * média restant (par sortOrder) en nouvelle couverture (mission §17). Sans
 * effet si le média supprimé n'était pas la couverture, ou s'il ne reste
 * aucun média (zéro couverture permis dans ce cas).
 */
export async function reassignCoverAfterDelete(
  tx: DrizzleTransaction,
  module: ProductMediaModule,
  productId: string,
): Promise<void> {
  const [next] = await tx
    .select({ id: productMedia.id })
    .from(productMedia)
    .where(and(eq(productMedia.module, module), eq(productMedia.productId, productId)))
    .orderBy(productMedia.sortOrder)
    .limit(1)
  if (next) {
    await tx.update(productMedia).set({ isCover: true }).where(eq(productMedia.id, next.id))
  }
}

/**
 * Vérifie qu'une liste réordonnée correspond EXACTEMENT à l'ensemble des
 * médias existants d'un produit — ni manquant, ni ajouté, ni média d'un
 * autre produit/agence injecté (mission §26 : tests sécurité). Fonction
 * pure, testable sans DB.
 */
export function isValidReorderSet(existingIds: string[], orderedIds: string[]): boolean {
  const existingSet = new Set(existingIds)
  return orderedIds.length === existingSet.size && orderedIds.every((id) => existingSet.has(id))
}

/**
 * Bascule la couverture de manière atomique : retire d'abord la couverture
 * de TOUS les médias du produit (aucune ligne à is_cover=true après cette
 * étape), puis pose la nouvelle — jamais deux vraies en même temps, jamais
 * de conflit avec l'index unique partiel `product_media_one_cover_uniq`
 * (mission §17).
 */
export async function setCoverAtomic(
  tx: DrizzleTransaction,
  module: ProductMediaModule,
  productId: string,
  mediaId: string,
): Promise<void> {
  await tx
    .update(productMedia)
    .set({ isCover: false })
    .where(and(eq(productMedia.module, module), eq(productMedia.productId, productId)))
  await tx.update(productMedia).set({ isCover: true }).where(eq(productMedia.id, mediaId))
}
