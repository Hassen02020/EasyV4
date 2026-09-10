/**
 * Margin Analytics - Easy2Book V6
 *
 * Service d'analyse des marges en temps réel — wrappers `"use server"`
 * authentifiés, appelés depuis le Client Component
 * app/admin/analytics/margins/page.tsx.
 *
 * PHASE 38G (hardening) — gap confirmé : ces 7 fonctions prenaient
 * auparavant `agencyId` en paramètre simple fourni par l'appelant, sans
 * AUCUNE vérification de session à l'intérieur. Comme tout export d'un
 * fichier `"use server"`, chacune est un Server Action Next.js
 * indépendamment invocable — la garde de route `/admin/layout.tsx`
 * (isAllowedIntoAdmin) ne protège que la PAGE, jamais l'action elle-même.
 * N'importe qui pouvait donc appeler `getMarginKPIs("<agence-cible>", ...)`
 * directement et lire le chiffre d'affaires, le coût, la marge, la
 * commission et le détail par réservation de N'IMPORTE QUELLE agence —
 * même motif déjà corrigé Phase 38A/27 ailleurs dans le repo.
 *
 * Correctif : la logique DB déménage dans margin-analytics-core.ts (pas
 * "use server", testable directement). Ici, chaque wrapper résout la
 * session Supabase + le profil admin (même garde que /admin/layout.tsx —
 * isAllowedIntoAdmin, staff OTA uniquement) et ne fait JAMAIS confiance à
 * un agencyId fourni par le client — il vient exclusivement du profil
 * résolu serveur.
 */
"use server"

import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { isAllowedIntoAdmin } from "@/lib/auth/admin-gate"
import {
  getMarginKPIsCore,
  getMarginBySupplierCore,
  getMarginByProductTypeCore,
  getTopMarginReservationsCore,
  getMarginEvolutionCore,
  getActiveMarginRulesCore,
  getRecentWalletTransactionsCore,
  type MarginKPIs,
  type MarginBySupplier,
  type MarginByProductType,
  type TopMarginReservation,
} from "./margin-analytics-core"

export type {
  MarginKPIs,
  MarginBySupplier,
  MarginByProductType,
  TopMarginReservation,
} from "./margin-analytics-core"

/**
 * Résout l'agencyId de l'admin OTA staff actuellement connecté — jamais un
 * agencyId fourni par le client. Lève une erreur explicite sinon (les
 * appelants "use server" de ce fichier laissent volontairement l'exception
 * remonter : la page appelante l'attrape déjà dans un try/catch).
 */
async function requireAdminAgencyId(): Promise<string> {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    throw new Error("Session expirée — reconnectez-vous.")
  }
  const profile = await getCurrentAdminProfile(user.id)
  if (!profile || !isAllowedIntoAdmin(profile.role, profile.agencyType)) {
    throw new Error("Accès non autorisé aux données de marge.")
  }
  return profile.agencyId
}

/** Récupère les KPIs de marge pour une période — agence résolue serveur. */
export async function getMarginKPIs(startDate: Date, endDate: Date): Promise<MarginKPIs> {
  const agencyId = await requireAdminAgencyId()
  return getMarginKPIsCore(agencyId, startDate, endDate)
}

/** Récupère les marges par fournisseur — agence résolue serveur. */
export async function getMarginBySupplier(
  startDate: Date,
  endDate: Date,
): Promise<MarginBySupplier[]> {
  const agencyId = await requireAdminAgencyId()
  return getMarginBySupplierCore(agencyId, startDate, endDate)
}

/** Récupère les marges par type de produit — agence résolue serveur. */
export async function getMarginByProductType(
  startDate: Date,
  endDate: Date,
): Promise<MarginByProductType[]> {
  const agencyId = await requireAdminAgencyId()
  return getMarginByProductTypeCore(agencyId, startDate, endDate)
}

/** Récupère les réservations avec les meilleures marges — agence résolue serveur. */
export async function getTopMarginReservations(
  startDate: Date,
  endDate: Date,
  limit: number = 10,
): Promise<TopMarginReservation[]> {
  const agencyId = await requireAdminAgencyId()
  return getTopMarginReservationsCore(agencyId, startDate, endDate, limit)
}

/** Récupère l'évolution des marges dans le temps — agence résolue serveur. */
export async function getMarginEvolution(
  startDate: Date,
  endDate: Date,
): Promise<Array<{ date: string; margin: number; revenue: number }>> {
  const agencyId = await requireAdminAgencyId()
  return getMarginEvolutionCore(agencyId, startDate, endDate)
}

/** Récupère les règles de marge actives de l'agence — agence résolue serveur. */
export async function getActiveMarginRules() {
  const agencyId = await requireAdminAgencyId()
  return getActiveMarginRulesCore(agencyId)
}

/** Récupère les transactions wallet récentes de l'agence — agence résolue serveur. */
export async function getRecentWalletTransactions(limit: number = 20) {
  const agencyId = await requireAdminAgencyId()
  return getRecentWalletTransactionsCore(agencyId, limit)
}
