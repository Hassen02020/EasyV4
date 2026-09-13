/**
 * Résolution des lectures Media System vers des URLs publiques affichables
 * (mission §23/§24/§25 : cartes, détail, galerie, Media Manager admin).
 *
 * Le fetch DB brut vit dans lib/media/media-core.ts (pas de secret, testable
 * directement) ; ce fichier n'ajoute que la résolution des URLs Storage
 * (getMediaStorage(), qui peut manipuler la clé service role Supabase) —
 * server-only pour cette seule raison, voir lib/media/storage.ts.
 */

import "server-only"
import type { DrizzleTransaction } from "@/lib/db/client"
import type { ProductMedia } from "@/lib/db/schema"
import { fetchProductMediaRows, fetchCoverMediaRows } from "./media-core"
import { getMediaStorage } from "./storage"
import type { ProductMediaModule } from "@/lib/admin/product-constants"

export interface ResolvedProductMedia {
  id: string
  originalUrl: string
  largeUrl: string
  mediumUrl: string
  cardUrl: string
  thumbnailUrl: string
  originalFilename: string
  altText: string | null
  sortOrder: number
  isCover: boolean
}

function resolveRow(row: ProductMedia): ResolvedProductMedia {
  const storage = getMediaStorage()
  const variants = row.variants
  return {
    id: row.id,
    originalUrl: storage.getPublicUrl(row.storageKey),
    largeUrl: storage.getPublicUrl(variants.large ?? row.storageKey),
    mediumUrl: storage.getPublicUrl(variants.medium ?? row.storageKey),
    cardUrl: storage.getPublicUrl(variants.card ?? row.storageKey),
    thumbnailUrl: storage.getPublicUrl(variants.thumbnail ?? row.storageKey),
    originalFilename: row.originalFilename,
    altText: row.altText,
    sortOrder: row.sortOrder,
    isCover: row.isCover,
  }
}

/** Galerie complète d'un produit, dans l'ordre d'affichage (mission §18). */
export async function getProductMedia(
  tx: DrizzleTransaction,
  agencyId: string,
  module: ProductMediaModule,
  productId: string,
): Promise<ResolvedProductMedia[]> {
  const rows = await fetchProductMediaRows(tx, agencyId, module, productId)
  return rows.map(resolveRow)
}

/**
 * Couverture de plusieurs produits en une seule requête (pages liste —
 * évite le N+1 sur une grille de cartes). Ne renvoie que les produits ayant
 * une couverture ; l'appelant applique le fallback legacy/générique pour
 * les autres (mission §23/§24).
 */
export async function getCoverMediaForProducts(
  tx: DrizzleTransaction,
  agencyId: string,
  module: ProductMediaModule,
  productIds: string[],
): Promise<Map<string, ResolvedProductMedia>> {
  const rows = await fetchCoverMediaRows(tx, agencyId, module, productIds)
  const result = new Map<string, ResolvedProductMedia>()
  for (const row of rows) result.set(row.productId, resolveRow(row))
  return result
}
