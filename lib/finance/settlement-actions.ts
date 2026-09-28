"use server"

/**
 * Wrappers "use server" pour les actions de settlement (Chantier 41).
 *
 * `commission-settlement.ts` contient la logique DB mais délègue la
 * vérification de session à l'appelant ("vérifié en amont par l'appelant").
 * Ces wrappers ferment ce gap : session Supabase + rôle super_admin vérifiés
 * avant tout appel aux fonctions core.
 */

import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import {
  settleCommissions,
  markSettlementPaid,
  getUnsettledCommissionBalance,
} from "./commission-settlement"

export type SettlementActionResult =
  | { ok: true; settlementId: string; totalAmount: number; entryCount: number }
  | { ok: false; error: string }

async function requireSuperAdmin() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { user: null, error: "NOT_AUTHENTICATED" as const }
  const profile = await getCurrentAdminProfile(user.id)
  if (profile?.role !== "super_admin") return { user: null, error: "FORBIDDEN" as const }
  return { user, error: null }
}

/**
 * Déclenche un nouveau settlement pour la période YYYY-MM-DD → YYYY-MM-DD.
 * Idempotent si aucune entrée non settlée n'existe (retourne entryCount=0).
 * Retourne une erreur lisible si un settlement existe déjà pour cette période.
 */
export async function triggerCommissionSettlement(
  periodStart: string,
  periodEnd: string,
  notes?: string,
): Promise<SettlementActionResult> {
  const { user, error } = await requireSuperAdmin()
  if (!user) return { ok: false, error }

  const start = new Date(periodStart)
  const end = new Date(periodEnd)
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) {
    return { ok: false, error: "Période invalide — la date de fin doit être postérieure à la date de début." }
  }

  try {
    const result = await settleCommissions(start, end, user.id, notes)
    return {
      ok: true,
      settlementId: result.settlementId,
      totalAmount: result.totalAmount,
      entryCount: result.entryCount,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes("commission_settlements_period_uniq")) {
      return { ok: false, error: "Un settlement existe déjà pour cette période exacte." }
    }
    return { ok: false, error: "Erreur settlement : " + msg }
  }
}

/**
 * Passe un settlement de 'pending' → 'paid' après virement réel effectué.
 */
export async function confirmSettlementPaid(settlementId: string): Promise<SettlementActionResult> {
  const { user, error } = await requireSuperAdmin()
  if (!user) return { ok: false, error }

  try {
    await markSettlementPaid(settlementId, user.id)
    return { ok: true, settlementId, totalAmount: 0, entryCount: 0 }
  } catch (err) {
    return {
      ok: false,
      error: "Erreur : " + (err instanceof Error ? err.message : String(err)),
    }
  }
}

/**
 * Solde des commissions non encore settlées (toutes périodes).
 * Wrapper exposé pour réutilisation côté server component.
 */
export async function loadUnsettledBalance(): Promise<number> {
  const { user } = await requireSuperAdmin()
  if (!user) return 0
  return getUnsettledCommissionBalance()
}
