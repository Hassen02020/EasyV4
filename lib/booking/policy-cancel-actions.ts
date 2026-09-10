"use server"

/**
 * Annulation B2C — Omra / Package / Activity (Policy Engine).
 *
 * Wrapper FIN uniquement — la logique réelle vit dans
 * `lib/booking/policy-cancel-core.ts` (PAS `"use server"`, voir sa doc de
 * tête, Phase 38A) : ce fichier se contente de résoudre la session Supabase
 * courante et l'agence tenant AVANT de déléguer — `cancelMyPolicyReservation`
 * est le SEUL export ici, le seul point d'entrée authentifié pour annuler
 * une réservation Omra/Package/Activity côté client B2C.
 */

import { guestTenantContext } from "@/lib/hotel-suppliers/tenant/live-resolution"
import { createServerSupabase } from "@/lib/supabase/server"
import { cancelPolicyReservationCore, type CancelPolicyReservationResult } from "./policy-cancel-core"

export async function cancelMyPolicyReservation(
  reservationId: string,
): Promise<CancelPolicyReservationResult> {
  if (!process.env.DATABASE_URL) {
    return { ok: false, error: "Base de données non configurée" }
  }

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email) return { ok: false, error: "NOT_AUTHENTICATED", code: "NOT_AUTHENTICATED" }

  const tenant = await guestTenantContext()
  if (!tenant) return { ok: false, error: "Aucune agence n'est configurée pour ce site." }

  return cancelPolicyReservationCore(tenant, { authUserId: user.id, verifiedEmail: user.email }, reservationId)
}
