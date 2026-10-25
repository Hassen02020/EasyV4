"use server"

/**
 * Configuration des moyens de recharge B2C manuels (coordonnées bancaires,
 * D17, espèces à l'agence) — super_admin uniquement
 * (WALLET-B2C-RECHARGE-METHODS-01). Les valeurs sont saisies ici par le
 * super_admin : aucune coordonnée n'est codée dans l'application.
 */

import { revalidatePath } from "next/cache"

import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { withTenantContext } from "@/lib/db/tenant-context"
import { logger } from "@/lib/logger"
import { saveTopupPaymentMethod } from "@/lib/finance/customer-topup-manual-core"

export type SaveTopupMethodActionResult =
  | { ok: true }
  | { ok: false; error: string }

export async function saveTopupPaymentMethodAction(input: {
  method: string
  enabled: boolean
  details: Record<string, string>
  instructions?: string
}): Promise<SaveTopupMethodActionResult> {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "Non authentifié." }

  const profile = await getCurrentAdminProfile(user.id)
  if (profile?.role !== "super_admin") {
    return { ok: false, error: "Accès refusé : rôle super_admin requis." }
  }

  // Moyens proposés sur la vitrine B2C = agence par défaut (même résolution
  // que guestTenantContext()).
  const { getDefaultAgencyId } = await import("@/lib/agencies/default-agency")
  const agencyId = await getDefaultAgencyId()
  if (!agencyId) return { ok: false, error: "Agence B2C introuvable." }

  try {
    const result = await withTenantContext(
      { agencyId: null, userId: user.id, isSuperAdmin: true },
      (tx) =>
        saveTopupPaymentMethod(tx, {
          agencyId,
          actorUserId: user.id,
          method: input.method,
          enabled: input.enabled === true,
          details: input.details ?? {},
          instructions: input.instructions,
        }),
    )
    if (!result.ok) {
      if (result.code === "INCOMPLETE") {
        return {
          ok: false,
          error:
            "Impossible d'activer ce moyen : tous les champs obligatoires doivent être renseignés.",
        }
      }
      if (result.code === "INVALID_DETAILS") {
        return {
          ok: false,
          error: `Coordonnées invalides : ${(result.errors ?? []).join(", ")}`,
        }
      }
      return { ok: false, error: "Moyen de recharge invalide." }
    }
  } catch (err) {
    logger.error("[topup-payment-methods] save failed", {
      error: err instanceof Error ? err.message : String(err),
    })
    return { ok: false, error: "Erreur lors de l'enregistrement." }
  }

  revalidatePath("/admin/accounting/recharges/moyens")
  return { ok: true }
}
