/**
 * CONSENT-01 — permission marketing par point de contact (PAS par lead,
 * PAS par une "personne" — aucune des deux n'a d'identité canonique dans
 * ce dépôt, voir audit de conception, docs/ROADMAP.md).
 *
 * PAS un fichier `"use server"` (même convention que leads-core.ts) —
 * `resolveConsentStatusCore` est une fonction pure testable sans DB ;
 * `recordConsentEventCore`/`hasMarketingConsentCore` sont les seuls
 * points qui touchent Postgres.
 *
 * Clé de résolution : (agencyId, channel, contactRef, purpose). Le
 * dernier événement par `occurredAt` fait foi — délibérément différent
 * de `lib/crm/network-demand-capture-core.ts` (jamais "dernier gagne"
 * là-bas) : ici il n'existe qu'un seul auteur légitime (la personne
 * elle-même, ou un staff agissant en son nom de façon traçable),
 * jamais des tiers concurrents qui s'affirment des choses contradictoires
 * sur la même donnée.
 *
 * Absence totale d'événement = PAS de consentement (false) — jamais une
 * présomption d'accord. Aucun backfill, aucune donnée inventée.
 *
 * HORS SCOPE strict (audit de conception validé) : envoi, campagne,
 * promotion, audience, automatisation, scoring. Ce module répond à UNE
 * seule question — "ai-je le droit ?" — jamais "dois-je envoyer ?".
 */

import { and, desc, eq } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import {
  leadConsentEvents,
  CONSENT_PURPOSES,
  CONSENT_ACTIONS,
  CRM_CHANNELS,
  type ConsentPurpose,
  type ConsentAction,
  type CrmChannel,
} from "@/lib/db/schema"

export { CONSENT_PURPOSES, CONSENT_ACTIONS, CRM_CHANNELS }
export type { ConsentPurpose, ConsentAction, CrmChannel }

export interface ConsentEventRow {
  id: string
  agencyId: string
  channel: CrmChannel
  contactRef: string
  purpose: ConsentPurpose
  action: ConsentAction
  occurredAt: Date
  source: string
  proofRef: string | null
  recordedByUserId: string | null
}

/** Email en minuscules (évite qu'un même contact soit traité comme 2 points de contact distincts selon la casse) — téléphone laissé tel quel (aucune normalisation E.164 ici, hors scope). */
export function normalizeContactRef(raw: string): string {
  const trimmed = raw.trim()
  return trimmed.includes("@") ? trimmed.toLowerCase() : trimmed
}

/**
 * Fonction pure — le dernier événement par `occurredAt` fait foi, jamais
 * l'ordre d'insertion. Liste vide → false (absence = pas de consentement).
 */
export function resolveConsentStatusCore(events: ConsentEventRow[]): boolean {
  if (events.length === 0) return false
  const latest = events.reduce((a, b) =>
    b.occurredAt.getTime() >= a.occurredAt.getTime() ? b : a,
  )
  return latest.action === "granted"
}

export type RecordConsentEventResult =
  | { ok: true; eventId: string }
  | {
      ok: false
      code: "INVALID_CHANNEL" | "INVALID_PURPOSE" | "INVALID_ACTION"
    }

export async function recordConsentEventCore(
  tx: DrizzleTransaction,
  params: {
    agencyId: string
    channel: string
    contactRef: string
    purpose: string
    action: string
    source: string
    proofRef?: string | null
    recordedByUserId?: string | null
  },
): Promise<RecordConsentEventResult> {
  if (!(CRM_CHANNELS as readonly string[]).includes(params.channel)) {
    return { ok: false, code: "INVALID_CHANNEL" }
  }
  if (!(CONSENT_PURPOSES as readonly string[]).includes(params.purpose)) {
    return { ok: false, code: "INVALID_PURPOSE" }
  }
  if (!(CONSENT_ACTIONS as readonly string[]).includes(params.action)) {
    return { ok: false, code: "INVALID_ACTION" }
  }

  const [inserted] = await tx
    .insert(leadConsentEvents)
    .values({
      agencyId: params.agencyId,
      channel: params.channel,
      contactRef: normalizeContactRef(params.contactRef),
      purpose: params.purpose,
      action: params.action,
      source: params.source,
      proofRef: params.proofRef ?? undefined,
      recordedByUserId: params.recordedByUserId ?? undefined,
    })
    .returning({ id: leadConsentEvents.id })

  return { ok: true, eventId: inserted!.id }
}

/**
 * Seul point de contact DB pour la question "ai-je le droit ?" — délègue
 * tout le calcul à resolveConsentStatusCore, jamais de logique dupliquée.
 */
export async function hasMarketingConsentCore(
  tx: DrizzleTransaction,
  params: { agencyId: string; channel: string; contactRef: string },
): Promise<boolean> {
  const rows = await tx
    .select()
    .from(leadConsentEvents)
    .where(
      and(
        eq(leadConsentEvents.agencyId, params.agencyId),
        eq(leadConsentEvents.channel, params.channel),
        eq(
          leadConsentEvents.contactRef,
          normalizeContactRef(params.contactRef),
        ),
        eq(leadConsentEvents.purpose, "marketing"),
      ),
    )
    .orderBy(desc(leadConsentEvents.occurredAt))

  return resolveConsentStatusCore(
    rows.map((r) => ({
      ...r,
      channel: r.channel as CrmChannel,
      purpose: r.purpose as ConsentPurpose,
      action: r.action as ConsentAction,
    })),
  )
}

/** Historique complet, pour audit/preuve — jamais utilisé par une vérification d'éligibilité (hasMarketingConsentCore suffit pour ça). */
export async function getConsentEventsCore(
  tx: DrizzleTransaction,
  params: { agencyId: string; channel: string; contactRef: string },
): Promise<ConsentEventRow[]> {
  const rows = await tx
    .select()
    .from(leadConsentEvents)
    .where(
      and(
        eq(leadConsentEvents.agencyId, params.agencyId),
        eq(leadConsentEvents.channel, params.channel),
        eq(
          leadConsentEvents.contactRef,
          normalizeContactRef(params.contactRef),
        ),
      ),
    )
    .orderBy(desc(leadConsentEvents.occurredAt))

  return rows.map((r) => ({
    ...r,
    channel: r.channel as CrmChannel,
    purpose: r.purpose as ConsentPurpose,
    action: r.action as ConsentAction,
  }))
}
