"use server"

/**
 * Wrappers "use server" pour SUPPLIER-SETTLEMENT-01 — même pattern que
 * `lib/finance/settlement-actions.ts` : `supplier-settlement.ts` délègue la
 * vérification de session à l'appelant, ces wrappers ferment ce gap : session
 * Supabase + rôle super_admin vérifiés avant tout appel aux fonctions core.
 * Défense en profondeur : chaque fonction SQL revérifie aussi l'acteur
 * (`assert_supplier_settlement_actor`, 0135) — ce wrapper n'est pas la seule
 * garantie, mais reste la première ligne (évite un aller-retour SQL inutile
 * pour un appelant non autorisé).
 */

import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import {
  declareSupplierSettlement,
  confirmSupplierSettlement,
  cancelSupplierSettlementDeclaration,
  requestSupplierSettlementCorrection,
  requestSupplierSettlementReversal,
  listUnsettledSupplierDebts,
  listSupplierSettlements,
  type SupplierSettlementEntryInput,
  type SupplierDueEntitlement,
  type SupplierSettlementRow,
} from "./supplier-settlement"

export type SupplierSettlementActionResult =
  | { ok: true; settlementId: string }
  | { ok: false; error: string }

async function requireSuperAdmin() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { user: null, error: "NOT_AUTHENTICATED" as const }
  const profile = await getCurrentAdminProfile(user.id)
  if (profile?.role !== "super_admin")
    return { user: null, error: "FORBIDDEN" as const }
  return { user, error: null }
}

export async function triggerSupplierSettlement(
  supplierId: string,
  entries: SupplierSettlementEntryInput[],
  proofReference: string | null,
  notes: string | null,
): Promise<SupplierSettlementActionResult> {
  const { user, error } = await requireSuperAdmin()
  if (!user) return { ok: false, error }
  try {
    const settlementId = await declareSupplierSettlement(
      user.id,
      supplierId,
      entries,
      proofReference,
      notes,
    )
    return { ok: true, settlementId }
  } catch (err) {
    return {
      ok: false,
      error:
        "Erreur déclaration : " +
        (err instanceof Error ? err.message : String(err)),
    }
  }
}

export async function confirmSupplierSettlementAction(
  settlementId: string,
): Promise<SupplierSettlementActionResult> {
  const { user, error } = await requireSuperAdmin()
  if (!user) return { ok: false, error }
  try {
    await confirmSupplierSettlement(user.id, settlementId)
    return { ok: true, settlementId }
  } catch (err) {
    return {
      ok: false,
      error:
        "Erreur confirmation : " +
        (err instanceof Error ? err.message : String(err)),
    }
  }
}

export async function cancelSupplierSettlementAction(
  settlementId: string,
): Promise<SupplierSettlementActionResult> {
  const { user, error } = await requireSuperAdmin()
  if (!user) return { ok: false, error }
  try {
    await cancelSupplierSettlementDeclaration(user.id, settlementId)
    return { ok: true, settlementId }
  } catch (err) {
    return {
      ok: false,
      error:
        "Erreur annulation : " +
        (err instanceof Error ? err.message : String(err)),
    }
  }
}

export async function requestSupplierSettlementCorrectionAction(
  entitlementId: string,
  targetSettlementId: string | null,
  correctionCause: "calculation_error" | "duplicate_entry" | "supplier_refund",
  amount: number,
  externalReference: string | null,
  cancellationReviewNote: string | null,
): Promise<SupplierSettlementActionResult> {
  const { user, error } = await requireSuperAdmin()
  if (!user) return { ok: false, error }
  try {
    const settlementId = await requestSupplierSettlementCorrection(
      user.id,
      entitlementId,
      targetSettlementId,
      correctionCause,
      amount,
      externalReference,
      cancellationReviewNote,
    )
    return { ok: true, settlementId }
  } catch (err) {
    return {
      ok: false,
      error:
        "Erreur correction : " +
        (err instanceof Error ? err.message : String(err)),
    }
  }
}

export async function requestSupplierSettlementReversalAction(
  targetSettlementId: string,
  reversalCause:
    | "rejected_payment"
    | "erroneous_confirmation"
    | "duplicate_payment"
    | "other",
  reference: string | null,
): Promise<SupplierSettlementActionResult> {
  const { user, error } = await requireSuperAdmin()
  if (!user) return { ok: false, error }
  try {
    const settlementId = await requestSupplierSettlementReversal(
      user.id,
      targetSettlementId,
      reversalCause,
      reference,
    )
    return { ok: true, settlementId }
  } catch (err) {
    return {
      ok: false,
      error:
        "Erreur réversion : " +
        (err instanceof Error ? err.message : String(err)),
    }
  }
}

export async function loadUnsettledSupplierDebts(
  supplierNodeId: string,
): Promise<SupplierDueEntitlement[]> {
  const { user } = await requireSuperAdmin()
  if (!user) return []
  return listUnsettledSupplierDebts(supplierNodeId)
}

export async function loadSupplierSettlements(
  supplierNodeId: string,
): Promise<SupplierSettlementRow[]> {
  const { user } = await requireSuperAdmin()
  if (!user) return []
  return listSupplierSettlements(supplierNodeId)
}
