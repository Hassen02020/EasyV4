/**
 * CRM / Leads — Relance (étape 3/3 : Conversion → Scoring → Relance, voir
 * leads-core.ts et lead-scoring-core.ts pour les étapes précédentes).
 * Moteur central, PAS un fichier `"use server"` (même leçon Phase 38A).
 *
 * Portée délibérément limitée à l'ALERTE STAFF : un lead resté "new" (jamais
 * contacté) plus de `thresholdDays` jours est marqué "à relancer" dans
 * /admin/support. AUCUN envoi automatique (WhatsApp/email/SMS) vers le lead
 * lui-même — le mandat produit demandait explicitement "après définition
 * des délais/canaux" : les délais sont ici configurables par le staff, mais
 * le CANAL d'un éventuel envoi automatique vers le lead (quel message,
 * quelle plateforme, quel template WhatsApp pré-approuvé Meta pour un
 * contact hors fenêtre de service client) reste une décision produit non
 * tranchée — jamais inventée ici plutôt que de fabriquer un contenu
 * marketing ou de risquer une violation de la politique WhatsApp Business.
 */

import { eq } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import { leadRelanceSettings, type NewLeadRelanceSetting } from "@/lib/db/schema"
import type { LeadRow } from "./leads-core"

export const DEFAULT_RELANCE_THRESHOLD_DAYS = 3

export interface LeadRelanceSettingsValue {
  thresholdDays: number
  isEnabled: boolean
}

export function defaultLeadRelanceSettings(): LeadRelanceSettingsValue {
  return { thresholdDays: DEFAULT_RELANCE_THRESHOLD_DAYS, isEnabled: true }
}

/**
 * Un lead est "à relancer" si : la relance est activée pour l'agence, le
 * lead est encore au statut "new" (jamais contacté — contacted/converted/
 * closed signifient qu'un staff a déjà agi, rien à relancer), et
 * `updatedAt` (dernier geste staff, sinon `createdAt` à la création) date
 * de plus de `thresholdDays` jours. Pure, sans DB — testable directement.
 */
export function isLeadStale(lead: LeadRow, settings: LeadRelanceSettingsValue, now: Date = new Date()): boolean {
  if (!settings.isEnabled) return false
  if (lead.status !== "new") return false
  const ageMs = now.getTime() - lead.updatedAt.getTime()
  return ageMs > settings.thresholdDays * 86_400_000
}

export async function getLeadRelanceSettingsCore(
  tx: DrizzleTransaction,
  params: { agencyId: string },
): Promise<LeadRelanceSettingsValue> {
  const [row] = await tx
    .select({ thresholdDays: leadRelanceSettings.thresholdDays, isEnabled: leadRelanceSettings.isEnabled })
    .from(leadRelanceSettings)
    .where(eq(leadRelanceSettings.agencyId, params.agencyId))
    .limit(1)
  return row ?? defaultLeadRelanceSettings()
}

export async function upsertLeadRelanceSettingsCore(
  tx: DrizzleTransaction,
  params: { agencyId: string; thresholdDays: number; isEnabled: boolean },
): Promise<{ id: string }> {
  const values: NewLeadRelanceSetting = {
    agencyId: params.agencyId,
    thresholdDays: params.thresholdDays,
    isEnabled: params.isEnabled,
  }
  const [row] = await tx
    .insert(leadRelanceSettings)
    .values(values)
    .onConflictDoUpdate({
      target: leadRelanceSettings.agencyId,
      set: { thresholdDays: values.thresholdDays, isEnabled: values.isEnabled, updatedAt: new Date() },
    })
    .returning({ id: leadRelanceSettings.id })
  return { id: row!.id }
}
