/**
 * Favoris (Wishlist) — moteur central, PAS un fichier `"use server"` (même
 * leçon Phase 38A que lib/loyalty/rewards-core.ts : toute fonction exportée
 * d'un fichier `"use server"` devient un Server Action Next.js candidat à
 * une invocation indépendante). Chaque fonction reçoit `agencyId`/
 * `authUserId` déjà résolus par l'appelant (jamais un id fourni par le
 * client) — testable directement contre une vraie transaction DB.
 *
 * Rattaché à `auth_user_id` (Supabase), JAMAIS à `customers.id` : un
 * visiteur connecté doit pouvoir mettre un hôtel en favori AVANT toute
 * réservation, donc avant qu'une ligne `customers` existe pour lui (voir
 * drizzle/manual/0040_customer_favorites.sql).
 */

import { and, desc, eq } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import { customerFavorites } from "@/lib/db/schema"

export const FAVORITE_ITEM_TYPES = ["hotel", "omra", "package", "activity"] as const
export type FavoriteItemType = (typeof FAVORITE_ITEM_TYPES)[number]

export interface FavoriteSnapshot {
  title: string
  imageUrl?: string | null
  location?: string | null
  priceFrom?: number | null
  currency?: string | null
  href: string
}

export interface FavoriteRow {
  id: string
  itemType: FavoriteItemType
  itemRef: string
  title: string
  imageUrl: string | null
  location: string | null
  priceFrom: string | null
  currency: string | null
  href: string
  createdAt: Date
}

/**
 * Ajoute ou retire le favori — jamais deux appels concurrents ne créent de
 * doublon (contrainte unique `customer_favorites_uniq`, voir la migration) :
 * un INSERT qui violerait l'unicité est traité comme "déjà favori" plutôt
 * que de faire remonter une erreur technique.
 */
export async function toggleFavoriteCore(
  tx: DrizzleTransaction,
  params: {
    agencyId: string
    authUserId: string
    itemType: FavoriteItemType
    itemRef: string
    snapshot: FavoriteSnapshot
  },
): Promise<{ favorited: boolean }> {
  const { agencyId, authUserId, itemType, itemRef, snapshot } = params

  const existing = await tx
    .select({ id: customerFavorites.id })
    .from(customerFavorites)
    .where(
      and(
        eq(customerFavorites.agencyId, agencyId),
        eq(customerFavorites.authUserId, authUserId),
        eq(customerFavorites.itemType, itemType),
        eq(customerFavorites.itemRef, itemRef),
      ),
    )
    .limit(1)

  if (existing[0]) {
    await tx.delete(customerFavorites).where(eq(customerFavorites.id, existing[0].id))
    return { favorited: false }
  }

  await tx.insert(customerFavorites).values({
    agencyId,
    authUserId,
    itemType,
    itemRef,
    title: snapshot.title,
    imageUrl: snapshot.imageUrl ?? undefined,
    location: snapshot.location ?? undefined,
    priceFrom: snapshot.priceFrom != null ? String(snapshot.priceFrom) : undefined,
    currency: snapshot.currency ?? undefined,
    href: snapshot.href,
  })
  return { favorited: true }
}

/**
 * Liste des favoris du client connecté, plus récents en premier — pour
 * "Mes favoris" (/compte) ET pour l'état initial (déjà favori ou non) des
 * cards de résultats de recherche.
 */
export async function listFavoritesCore(
  tx: DrizzleTransaction,
  params: { agencyId: string; authUserId: string },
): Promise<FavoriteRow[]> {
  const rows = await tx
    .select({
      id: customerFavorites.id,
      itemType: customerFavorites.itemType,
      itemRef: customerFavorites.itemRef,
      title: customerFavorites.title,
      imageUrl: customerFavorites.imageUrl,
      location: customerFavorites.location,
      priceFrom: customerFavorites.priceFrom,
      currency: customerFavorites.currency,
      href: customerFavorites.href,
      createdAt: customerFavorites.createdAt,
    })
    .from(customerFavorites)
    .where(
      and(
        eq(customerFavorites.agencyId, params.agencyId),
        eq(customerFavorites.authUserId, params.authUserId),
      ),
    )
    .orderBy(desc(customerFavorites.createdAt))

  return rows.map((r) => ({ ...r, itemType: r.itemType as FavoriteItemType }))
}

/**
 * Retire un favori par id — n'affecte jamais une ligne d'un autre
 * utilisateur ou d'une autre agence : la clause WHERE porte toujours les
 * TROIS conditions (id + authUserId + agencyId), jamais l'id seul (RLS ne
 * protège ici que l'isolation tenant, pas l'appartenance par utilisateur —
 * voir la doc de tête de la migration).
 */
export async function removeFavoriteCore(
  tx: DrizzleTransaction,
  params: { agencyId: string; authUserId: string; id: string },
): Promise<{ removed: boolean }> {
  const deleted = await tx
    .delete(customerFavorites)
    .where(
      and(
        eq(customerFavorites.id, params.id),
        eq(customerFavorites.authUserId, params.authUserId),
        eq(customerFavorites.agencyId, params.agencyId),
      ),
    )
    .returning({ id: customerFavorites.id })

  return { removed: deleted.length > 0 }
}
