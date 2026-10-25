"use server"

/**
 * Actions serveur — revue des recharges wallet B2C manuelles
 * (WALLET-B2C-RECHARGE-METHODS-01).
 *
 * L'identité du validateur (user, rôle, agence) est résolue ici depuis la
 * session Supabase + resolve_session_context() — jamais transmise par le
 * navigateur. La décision (verrou, crédit unique, audit) est dans
 * lib/finance/customer-topup-manual-core.ts.
 */

import { revalidatePath } from "next/cache"

import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { withTenantContext } from "@/lib/db/tenant-context"
import { logger } from "@/lib/logger"
import {
  reviewManualTopupRequest,
  TOPUP_REVIEWER_ROLES,
  type ReviewTopupResult,
} from "@/lib/finance/customer-topup-manual-core"

export type ReviewCustomerTopUpResult =
  | { ok: true }
  | { ok: false; error: string }

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function errorMessage(
  result: Exclude<ReviewTopupResult, { ok: true }>,
): string {
  switch (result.code) {
    case "FORBIDDEN":
      return "Accès refusé : validation des recharges non autorisée pour ce compte."
    case "NOT_FOUND":
      return "Demande de recharge introuvable."
    case "NOT_MANUAL":
      return "Une recharge par carte ne se valide pas manuellement."
    case "ALREADY_PROCESSED":
      return `Demande déjà traitée (statut : ${result.status ?? "inconnu"}).`
    case "REASON_REQUIRED":
      return "Le motif du rejet est obligatoire (3 à 500 caractères)."
    case "INVALID_AMOUNT":
      return "Montant de la demande invalide."
  }
}

async function review(
  requestId: string,
  decision: "approve" | "reject",
  reason?: string,
): Promise<ReviewCustomerTopUpResult> {
  if (!UUID_RE.test(requestId)) {
    return { ok: false, error: "Demande de recharge introuvable." }
  }

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "Non authentifié." }

  const profile = await getCurrentAdminProfile(user.id)
  if (
    !profile ||
    profile.agencyType !== "ota" ||
    !(TOPUP_REVIEWER_ROLES as readonly string[]).includes(profile.role)
  ) {
    return { ok: false, error: errorMessage({ ok: false, code: "FORBIDDEN" }) }
  }
  const isSuperAdmin = profile.role === "super_admin"

  try {
    const result = await withTenantContext(
      {
        agencyId: isSuperAdmin ? null : profile.agencyId,
        userId: user.id,
        isSuperAdmin,
      },
      (tx) =>
        reviewManualTopupRequest(tx, {
          requestId,
          decision,
          reason,
          reviewer: {
            userId: user.id,
            role: profile.role,
            agencyId: profile.agencyId,
            isSuperAdmin,
          },
        }),
    )
    if (!result.ok) return { ok: false, error: errorMessage(result) }
  } catch (err) {
    logger.error("[b2c-topup-review] failed", {
      requestId,
      decision,
      error: err instanceof Error ? err.message : String(err),
    })
    return {
      ok: false,
      error: "Échec du traitement : aucune modification n'a été enregistrée.",
    }
  }

  revalidatePath("/admin/accounting/recharges")
  return { ok: true }
}

export async function validateCustomerTopUp(
  requestId: string,
): Promise<ReviewCustomerTopUpResult> {
  return review(requestId, "approve")
}

export async function rejectCustomerTopUp(
  requestId: string,
  reason: string,
): Promise<ReviewCustomerTopUpResult> {
  return review(requestId, "reject", reason)
}
