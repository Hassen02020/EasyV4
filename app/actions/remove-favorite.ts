"use server"

/**
 * Favoris (Wishlist) — retrait depuis "Mes favoris" (/compte), par id plutôt
 * que par (itemType, itemRef) : évite à l'UI de devoir reconstituer
 * l'instantané complet juste pour retirer une ligne déjà affichée.
 *
 * Appartenance vérifiée par `removeFavoriteCore` (authUserId + agencyId,
 * jamais l'id seul) — jamais de FORBIDDEN qui confirmerait l'existence du
 * favori d'un autre client : `removed: false` silencieux si la ligne
 * n'appartient pas à ce client (même déjà retirée, même jamais existé).
 */

import { z } from "zod"
import { withTenantContext } from "@/lib/db/tenant-context"
import { guestTenantContext } from "@/lib/hotel-suppliers/tenant/live-resolution"
import { createServerSupabase } from "@/lib/supabase/server"
import { removeFavoriteCore } from "@/lib/favorites/favorites-core"

const inputSchema = z.object({ id: z.string().uuid() })

export type RemoveFavoriteResult = { ok: true; removed: boolean } | { ok: false; error: string; code?: string }

export async function removeFavorite(raw: { id: string }): Promise<RemoveFavoriteResult> {
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
    return { ok: false, error: "Session expirée — reconnectez-vous.", code: "NOT_AUTHENTICATED" }
  }

  const tenant = await guestTenantContext()
  if (!tenant?.agencyId) {
    return { ok: false, error: "Aucune agence n'est configurée pour ce site." }
  }

  try {
    const result = await withTenantContext(tenant, (tx) =>
      removeFavoriteCore(tx, { agencyId: tenant.agencyId!, authUserId: user.id, id: parsed.data.id }),
    )
    return { ok: true, removed: result.removed }
  } catch (err) {
    console.error("[removeFavorite]", err)
    return { ok: false, error: "Erreur technique. Veuillez réessayer." }
  }
}
