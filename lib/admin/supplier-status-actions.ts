"use server"

/**
 * SUPPLIER-STATUS-CHECK-01 — action serveur du bouton « Vérifier chez le
 * fournisseur » (fiche réservation admin). Authentifie la session, lit le
 * rôle en base, puis délègue au cœur testable (contrôle super_admin, lecture
 * seule BookingList, trace d'audit).
 */
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { getMyGoClient } from "@/lib/mygo/client"
import { resolveMyGoAccessForTenant } from "@/lib/hotel-suppliers/tenant/live-resolution"
import {
  checkSupplierBookingStatusCore,
  type SupplierStatusResult,
} from "./supplier-status-core"

export async function checkSupplierBookingStatus(
  reservationId: string,
): Promise<SupplierStatusResult> {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, code: "FORBIDDEN", error: "Non authentifié." }
  }
  const profile = await getCurrentAdminProfile(user.id)
  if (!profile) {
    return { ok: false, code: "FORBIDDEN", error: "Profil introuvable." }
  }
  return checkSupplierBookingStatusCore({
    reservationId,
    actor: { userId: user.id, role: profile.role },
    // Compte myGo de l'agence de la réservation (même résolution que les
    // parcours de réservation ; repli explicite sur le compte global).
    resolveClient: async (agencyId, actorUserId) => {
      const access = await resolveMyGoAccessForTenant({
        agencyId,
        userId: actorUserId,
        isSuperAdmin: false,
      })
      return access.client ?? getMyGoClient()
    },
  })
}
