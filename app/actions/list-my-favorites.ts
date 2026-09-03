"use server"

/**
 * Favoris (Wishlist) — liste du client connecté. Sert deux usages :
 *  - "Mes favoris" (/compte) : rendu direct des lignes (instantané capturé à
 *    l'ajout, jamais un re-fetch fournisseur live — voir favorites-core.ts).
 *  - État initial "déjà favori" des cards de résultats de recherche (le
 *    cœur doit refléter la réalité au chargement, pas repartir à zéro).
 *
 * Visiteur non connecté : liste vide (`ok: true, favorites: []`), jamais une
 * erreur — l'absence de session n'est pas un défaut pour une simple lecture.
 */

import { withTenantContext } from "@/lib/db/tenant-context"
import { guestTenantContext } from "@/lib/hotel-suppliers/tenant/live-resolution"
import { createServerSupabase } from "@/lib/supabase/server"
import { listFavoritesCore, type FavoriteItemType } from "@/lib/favorites/favorites-core"

export interface MyFavorite {
  id: string
  itemType: FavoriteItemType
  itemRef: string
  title: string
  imageUrl: string | null
  location: string | null
  priceFrom: string | null
  currency: string | null
  href: string
  createdAt: string
}

export type ListMyFavoritesResult = { ok: true; favorites: MyFavorite[] } | { ok: false; error: string }

export async function listMyFavorites(): Promise<ListMyFavoritesResult> {
  if (!process.env.DATABASE_URL) {
    return { ok: true, favorites: [] }
  }

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: true, favorites: [] }
  }

  const tenant = await guestTenantContext()
  if (!tenant?.agencyId) {
    return { ok: true, favorites: [] }
  }

  try {
    const rows = await withTenantContext(tenant, (tx) =>
      listFavoritesCore(tx, { agencyId: tenant.agencyId!, authUserId: user.id }),
    )
    return {
      ok: true,
      favorites: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    }
  } catch (err) {
    console.error("[listMyFavorites]", err)
    return { ok: false, error: "Erreur technique. Veuillez réessayer." }
  }
}
