/**
 * NETWORK-DEMAND-CAPTURE-01 — journal de provenance d'un lead (campagne →
 * partenaire → commercial → canal → agence...) et résolution déterministe
 * des colonnes "cache" sur `leads` (originAgencyId/capturedByUserId/
 * channel/campaignRef).
 *
 * PAS un fichier `"use server"` (même convention que leads-core.ts).
 *
 * Modèle hybride validé (ROADMAP, audit de modélisation 2026-10-05) :
 *  - `leadOriginEvents` est la SEULE vérité, append-only, jamais réécrit.
 *  - Les colonnes résolues sur `leads` sont un cache dérivé, recalculé par
 *    balayage complet de l'historique à chaque écriture — jamais mutées
 *    directement ailleurs que par `recordLeadOriginEventCore()`.
 *
 * Règle de résolution DÉFINITIVE (fiche validée — JAMAIS "dernier événement
 * gagne" par date seule, qui laisserait un événement tardif de faible
 * confiance écraser une attribution fiable, ou deux acteurs concurrents se
 * départager arbitrairement par la date) :
 *  1. Chaque `source` a un rang de confiance fixe (LEAD_ORIGIN_SOURCE_TRUST).
 *  2. Par rôle : seuls les événements au rang de confiance MAXIMAL comptent
 *     — un rang inférieur ne peut JAMAIS écraser un rang supérieur, quelle
 *     que soit sa date.
 *  3. À ce rang maximal, un seul `actorRef` distinct → résolu (confirmation).
 *  4. À ce rang maximal, plusieurs `actorRef` distincts → CONFLIT réel →
 *     la colonne résolue repasse à NULL (jamais fusionné silencieusement,
 *     même principe que CANONICAL-HOTEL-01 pour les correspondances
 *     ambiguës — une donnée inconnue vaut mieux qu'une donnée fausse). Les
 *     événements en conflit restent tous visibles dans le journal.
 *  5. `recordedAt` ne départage JAMAIS deux acteurs concurrents — il ne
 *     sert qu'à choisir quel enregistrement représenter quand l'acteur est
 *     déjà non-ambigu (étape 3).
 *  6. Autorisation = contrôle séparé, À L'ÉCRITURE (voir params.authorized
 *     ci-dessous) — un événement non autorisé est rejeté avant d'entrer
 *     dans le journal, jamais seulement "pondéré faible" après résolution.
 */

import { and, eq, asc } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import { leadOriginEvents, leads, CRM_CHANNELS } from "@/lib/db/schema"

export const LEAD_ORIGIN_ROLES = [
  "campaign",
  "origin_agency",
  "captured_by_user",
  "channel",
] as const
export type LeadOriginRole = (typeof LEAD_ORIGIN_ROLES)[number]

/**
 * Pas de vocabulaire canal séparé : réutilise CRM_CHANNELS
 * (lib/db/schema.ts), déjà le vocabulaire établi pour "canal" dans ce
 * dépôt (crmConversations.channel) — éviter une seconde taxonomie
 * divergente (règle anti-doublon).
 */
export { CRM_CHANNELS as LEAD_CHANNELS }

/**
 * Rang de confiance par mécanisme de capture — plus haut = plus fiable.
 * Constante inspectable/testable, PAS une hiérarchie en base.
 */
export const LEAD_ORIGIN_SOURCE_TRUST: Record<string, number> = {
  staff_correction: 3,
  staff_manual_entry: 2,
  whatsapp_webhook: 1,
  /** META-LEADADS-WEBHOOK-01 — même rang que whatsapp_webhook : capture
   * temps réel signée (HMAC vérifié avant tout traitement), pas une
   * déclaration non vérifiée comme partner_portal_claim/utm_capture. */
  meta_leadads_webhook: 1,
  partner_portal_claim: 0,
  utm_capture: 0,
}

function trustOf(source: string): number {
  return LEAD_ORIGIN_SOURCE_TRUST[source] ?? 0
}

export interface LeadOriginEventRow {
  id: string
  leadId: string
  role: LeadOriginRole
  actorRef: string
  source: string
  notes: string | null
  recordedAt: Date
}

/**
 * Résout, pour un rôle donné, l'événement gagnant parmi tout l'historique
 * — fonction pure, testable sans DB, jamais incrémentale (balaye toujours
 * la liste complète → indépendante de l'ordre d'insertion).
 *
 * Règle de résolution définitive (fiche NETWORK-DEMAND-CAPTURE-01, §5/§7) :
 *  1. Ne considérer que les événements au rang de confiance MAXIMAL pour ce
 *     rôle — un rang inférieur ne peut jamais l'emporter, quelle que soit
 *     sa date.
 *  2. Si un seul `actorRef` distinct existe à ce rang maximal → résolu
 *     (confirmation, même source répétée ou sources différentes de même
 *     rang mais d'accord sur l'acteur).
 *  3. Si plusieurs `actorRef` distincts existent à ce rang maximal → CONFLIT
 *     réel → retourne `null`. JAMAIS un départage par date entre deux
 *     acteurs concurrents de même rang — "dernier gagne" est explicitement
 *     interdit par la fiche. `recordedAt` ne sert qu'à choisir QUEL
 *     événement représenter quand l'acteur est déjà non-ambigu (étape 2),
 *     jamais à trancher entre deux acteurs différents.
 */
export function resolveLeadOriginRoleCore(
  events: LeadOriginEventRow[],
  role: LeadOriginRole,
): LeadOriginEventRow | null {
  const forRole = events.filter((e) => e.role === role)
  if (forRole.length === 0) return null

  const maxTrust = Math.max(...forRole.map((e) => trustOf(e.source)))
  const atMaxTrust = forRole.filter((e) => trustOf(e.source) === maxTrust)

  const distinctActors = new Set(atMaxTrust.map((e) => e.actorRef))
  if (distinctActors.size > 1) {
    return null // CONFLIT réel au rang maximal — jamais résolu silencieusement.
  }

  // Un seul acteur à ce rang : aucune ambiguïté — recordedAt ne fait que
  // choisir quel enregistrement représenter (même actorRef partout).
  return atMaxTrust.reduce((latest, e) =>
    e.recordedAt.getTime() >= latest.recordedAt.getTime() ? e : latest,
  )
}

const RESOLVED_COLUMN_BY_ROLE: Record<
  LeadOriginRole,
  "originAgencyId" | "capturedByUserId" | "channel" | "campaignRef"
> = {
  origin_agency: "originAgencyId",
  captured_by_user: "capturedByUserId",
  channel: "channel",
  campaign: "campaignRef",
}

/**
 * Insère un nouvel événement de provenance puis recalcule et persiste la
 * colonne résolue correspondante sur `leads` — jamais l'inverse (jamais un
 * UPDATE direct de la colonne résolue sans événement qui le justifie).
 *
 * `authorized` : vérification faite par l'APPELANT (ex. seul le webhook
 * WhatsApp appelle avec role="channel"/source="whatsapp_webhook" ; un
 * partner_agent ne peut s'auto-assigner que son propre userId en
 * actorRef pour role="captured_by_user") — cette fonction ne fait aucune
 * hypothèse sur qui a le droit d'asserter quoi, elle refuse simplement
 * d'écrire si l'appelant ne confirme pas l'autorisation.
 */
export async function recordLeadOriginEventCore(
  tx: DrizzleTransaction,
  params: {
    agencyId: string
    leadId: string
    role: LeadOriginRole
    actorRef: string
    source: string
    notes?: string | null
    authorized: boolean
  },
): Promise<
  | { ok: true; eventId: string }
  | { ok: false; code: "NOT_AUTHORIZED" | "LEAD_NOT_FOUND" }
> {
  if (!params.authorized) {
    return { ok: false, code: "NOT_AUTHORIZED" }
  }

  const [lead] = await tx
    .select({ id: leads.id })
    .from(leads)
    .where(
      and(eq(leads.id, params.leadId), eq(leads.agencyId, params.agencyId)),
    )
    .limit(1)
  if (!lead) {
    return { ok: false, code: "LEAD_NOT_FOUND" }
  }

  const [inserted] = await tx
    .insert(leadOriginEvents)
    .values({
      agencyId: params.agencyId,
      leadId: params.leadId,
      role: params.role,
      actorRef: params.actorRef,
      source: params.source,
      notes: params.notes ?? undefined,
    })
    .returning({ id: leadOriginEvents.id })

  const allEvents = await tx
    .select()
    .from(leadOriginEvents)
    .where(eq(leadOriginEvents.leadId, params.leadId))
    .orderBy(asc(leadOriginEvents.recordedAt))

  const resolved = resolveLeadOriginRoleCore(
    allEvents.map((e) => ({
      id: e.id,
      leadId: e.leadId,
      role: e.role as LeadOriginRole,
      actorRef: e.actorRef,
      source: e.source,
      notes: e.notes,
      recordedAt: e.recordedAt,
    })),
    params.role,
  )

  const column = RESOLVED_COLUMN_BY_ROLE[params.role]
  await tx
    .update(leads)
    .set({ [column]: resolved?.actorRef ?? null, updatedAt: new Date() })
    .where(eq(leads.id, params.leadId))

  return { ok: true, eventId: inserted!.id }
}

/**
 * Historique complet de provenance d'un lead, ordre chronologique — pour
 * audit/debug, jamais utilisé dans un chemin de segmentation (NICHE-02
 * interroge les colonnes résolues sur `leads`, pas ce journal).
 */
export async function getLeadOriginEventsCore(
  tx: DrizzleTransaction,
  params: { agencyId: string; leadId: string },
): Promise<LeadOriginEventRow[]> {
  const rows = await tx
    .select()
    .from(leadOriginEvents)
    .where(
      and(
        eq(leadOriginEvents.leadId, params.leadId),
        eq(leadOriginEvents.agencyId, params.agencyId),
      ),
    )
    .orderBy(asc(leadOriginEvents.recordedAt))

  return rows.map((r) => ({
    id: r.id,
    leadId: r.leadId,
    role: r.role as LeadOriginRole,
    actorRef: r.actorRef,
    source: r.source,
    notes: r.notes,
    recordedAt: r.recordedAt,
  }))
}
