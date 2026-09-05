"use server"

/**
 * Avis clients — soumission par un client B2C authentifié (`/compte`),
 * jamais par un guest anonyme (contrairement au booking) : un avis engage
 * la réputation publique d'un produit, l'identité doit être vérifiée par
 * Supabase (même garde que toggleFavorite), pas seulement email+ref.
 */

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { withTenantContext } from "@/lib/db/tenant-context"
import { guestTenantContext } from "@/lib/hotel-suppliers/tenant/live-resolution"
import { createServerSupabase } from "@/lib/supabase/server"
import { submitReviewCore } from "@/lib/reviews/reviews-core"

const inputSchema = z.object({
  reservationId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(2000).optional(),
})

export type SubmitReviewInput = z.infer<typeof inputSchema>

export type SubmitReviewResult = { ok: true } | { ok: false; error: string; code?: string }

export async function submitReview(raw: SubmitReviewInput): Promise<SubmitReviewResult> {
  const parsed = inputSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Entrée invalide." }
  }
  if (!process.env.DATABASE_URL) {
    return { ok: false, error: "Service temporairement indisponible." }
  }

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email) {
    return { ok: false, error: "Connectez-vous pour laisser un avis.", code: "NOT_AUTHENTICATED" }
  }

  const tenant = await guestTenantContext()
  if (!tenant?.agencyId) {
    return { ok: false, error: "Aucune agence n'est configurée pour ce site." }
  }
  const agencyId = tenant.agencyId

  try {
    const result = await withTenantContext(tenant, (tx) =>
      submitReviewCore(tx, {
        agencyId,
        reservationId: parsed.data.reservationId,
        authUserId: user.id,
        verifiedEmail: user.email!,
        rating: parsed.data.rating,
        comment: parsed.data.comment || null,
      }),
    )
    if (!result.ok) {
      return { ok: false, error: result.error, code: result.code }
    }
    revalidatePath("/compte")
    return { ok: true }
  } catch (err) {
    console.error("[submitReview]", err)
    return { ok: false, error: "Erreur technique. Veuillez réessayer." }
  }
}
