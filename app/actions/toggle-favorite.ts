"use server"

/**
 * Favoris (Wishlist) — bascule ajout/retrait, appelée par le bouton cœur
 * (components/hotel-card.tsx, jusqu'ici un `useState` purement cosmétique
 * sans aucune persistance) et par toute future card catalogue
 * (omra/package/activity).
 *
 * Identité TOUJOURS résolue serveur (`supabase.auth.getUser()`) — jamais un
 * `authUserId` fourni par le client. Un visiteur non connecté reçoit
 * `code: "NOT_AUTHENTICATED"` (jamais un faux succès local) — à l'appelant
 * de proposer la connexion.
 */

import { z } from "zod"
import { withTenantContext } from "@/lib/db/tenant-context"
import { guestTenantContext } from "@/lib/hotel-suppliers/tenant/live-resolution"
import { createServerSupabase } from "@/lib/supabase/server"
import { FAVORITE_ITEM_TYPES, toggleFavoriteCore } from "@/lib/favorites/favorites-core"

const inputSchema = z.object({
  itemType: z.enum(FAVORITE_ITEM_TYPES),
  itemRef: z.string().trim().min(1).max(128),
  title: z.string().trim().min(1).max(255),
  imageUrl: z.string().trim().max(2048).optional().nullable(),
  location: z.string().trim().max(255).optional().nullable(),
  priceFrom: z.number().finite().nonnegative().optional().nullable(),
  currency: z.string().trim().length(3).optional().nullable(),
  href: z.string().trim().min(1).max(255),
})

export type ToggleFavoriteInput = z.infer<typeof inputSchema>

export type ToggleFavoriteResult =
  | { ok: true; favorited: boolean }
  | { ok: false; error: string; code?: string }

export async function toggleFavorite(raw: ToggleFavoriteInput): Promise<ToggleFavoriteResult> {
  const parsed = inputSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: "Entrée invalide." }
  }

  if (!process.env.DATABASE_URL) {
    return { ok: false, error: "Service temporairement indisponible." }
  }

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, error: "Connectez-vous pour ajouter des favoris.", code: "NOT_AUTHENTICATED" }
  }

  const tenant = await guestTenantContext()
  if (!tenant?.agencyId) {
    return { ok: false, error: "Aucune agence n'est configurée pour ce site." }
  }

  try {
    const result = await withTenantContext(tenant, (tx) =>
      toggleFavoriteCore(tx, {
        agencyId: tenant.agencyId!,
        authUserId: user.id,
        itemType: parsed.data.itemType,
        itemRef: parsed.data.itemRef,
        snapshot: {
          title: parsed.data.title,
          imageUrl: parsed.data.imageUrl,
          location: parsed.data.location,
          priceFrom: parsed.data.priceFrom,
          currency: parsed.data.currency,
          href: parsed.data.href,
        },
      }),
    )
    return { ok: true, favorited: result.favorited }
  } catch (err) {
    console.error("[toggleFavorite]", err)
    return { ok: false, error: "Erreur technique. Veuillez réessayer." }
  }
}
