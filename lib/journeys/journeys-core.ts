/**
 * JOURNEY-BUILDER-01 — moteur central, PAS un fichier `"use server"` (même
 * leçon Phase 38A que les autres modules `-core.ts` de ce projet :
 * `margins-core.ts`, `leads-core.ts`).
 *
 * Ce fichier ne contient AUCUNE logique financière/pricing — uniquement la
 * gestion d'état d'un `journey`/`journey_lines` et la garantie
 * "au plus une invocation du moteur réel par ligne" (CAS sur `status`).
 * Le calcul du prix réel et le débit restent entièrement dans le moteur du
 * module ciblé (lib/activities/booking-actions.ts, etc.) — voir
 * journey-actions.ts pour l'orchestration complète.
 */

import { and, desc, eq, inArray } from "drizzle-orm"
import { randomUUID } from "node:crypto"
import type { DrizzleTransaction } from "@/lib/db/client"
import {
  journeys,
  journeyLines,
  type Journey,
  type JourneyLine,
} from "@/lib/db/schema"

export type JourneyStatus = (typeof journeys.status.enumValues)[number]
export type JourneyLineStatus = (typeof journeyLines.status.enumValues)[number]

/** Modules réellement câblés dans le dispatcher (journey-actions.ts) en V1.
 * Vols/Hôtels Monde en sont volontairement exclus — voir la doc de tête de
 * journey-actions.ts pour la justification (pas un oubli). */
export const JOURNEY_WIRED_MODULES = [
  "hotel",
  "package",
  "omra",
  "activity",
  "transfer",
  "car",
  "network",
] as const
export type JourneyWiredModule = (typeof JOURNEY_WIRED_MODULES)[number]

/**
 * Dérive le statut du Journey à partir de ses lignes — jamais écrit à la
 * main ailleurs. Pure, testable directement.
 *
 *  - 0 ligne                                        → draft
 *  - au moins une ligne processing                  → processing
 *  - toutes confirmed                                → confirmed
 *  - toutes failed                                    → failed
 *  - aucune confirmed/failed (tout pending)           → ready
 *  - mélange (au moins un résultat confirmed/failed,
 *    mais pas 100% de l'un des deux)                 → partially_confirmed
 */
export function deriveJourneyStatus(lines: { status: JourneyLineStatus }[]): JourneyStatus {
  if (lines.length === 0) return "draft"
  const confirmed = lines.filter((l) => l.status === "confirmed").length
  const failed = lines.filter((l) => l.status === "failed").length
  const processing = lines.filter((l) => l.status === "processing").length
  if (processing > 0) return "processing"
  if (confirmed === lines.length) return "confirmed"
  if (failed === lines.length) return "failed"
  if (confirmed === 0 && failed === 0) return "ready"
  return "partially_confirmed"
}

async function recomputeAndPersistJourneyStatus(tx: DrizzleTransaction, journeyId: string): Promise<JourneyStatus> {
  const lines = await tx
    .select({ status: journeyLines.status })
    .from(journeyLines)
    .where(eq(journeyLines.journeyId, journeyId))
  const status = deriveJourneyStatus(lines)
  await tx.update(journeys).set({ status, updatedAt: new Date() }).where(eq(journeys.id, journeyId))
  return status
}

export async function createJourneyCore(
  tx: DrizzleTransaction,
  params: { agencyId: string; createdByUserId: string; customerId?: string; title?: string },
): Promise<Journey> {
  const [row] = await tx
    .insert(journeys)
    .values({
      agencyId: params.agencyId,
      createdByUserId: params.createdByUserId,
      customerId: params.customerId,
      title: params.title,
    })
    .returning()
  if (!row) throw new Error("createJourneyCore: insert a échoué")
  return row
}

/**
 * Composition (add/remove ligne) verrouillée dès qu'une confirmation a été
 * tentée — une fois qu'au moins une ligne est confirmed/failed/processing,
 * le Journey n'est plus "draft"/"ready" et la composition s'arrête (une
 * ligne FAILED reste retentable individuellement via confirmJourneyLine,
 * mais on n'ajoute plus de nouvelle ligne à ce Journey). Évite un état
 * ambigu (mélanger "encore en train de composer" et "déjà partiellement
 * exécuté").
 */
export async function addJourneyLineCore(
  tx: DrizzleTransaction,
  params: { journeyId: string; module: JourneyWiredModule; payload: unknown; priceTnd?: number },
): Promise<JourneyLine> {
  const [journey] = await tx.select().from(journeys).where(eq(journeys.id, params.journeyId)).limit(1)
  if (!journey) throw new Error("JOURNEY_NOT_FOUND")
  if (journey.status !== "draft" && journey.status !== "ready") {
    throw new Error("JOURNEY_COMPOSITION_LOCKED")
  }

  const [line] = await tx
    .insert(journeyLines)
    .values({
      journeyId: params.journeyId,
      module: params.module,
      payload: params.payload,
      priceTnd: params.priceTnd !== undefined ? params.priceTnd.toFixed(2) : undefined,
    })
    .returning()
  if (!line) throw new Error("addJourneyLineCore: insert a échoué")

  await recomputeAndPersistJourneyStatus(tx, params.journeyId)
  return line
}

export async function removeJourneyLineCore(tx: DrizzleTransaction, params: { lineId: string }): Promise<void> {
  const [line] = await tx.select().from(journeyLines).where(eq(journeyLines.id, params.lineId)).limit(1)
  if (!line) throw new Error("LINE_NOT_FOUND")
  // Jamais supprimer une ligne déjà confirmée/en cours (RULE FINANCIÈRE —
  // aucun rollback silencieux d'une preuve de réservation/tentative réelle).
  if (line.status !== "pending" && line.status !== "failed") {
    throw new Error("LINE_NOT_REMOVABLE")
  }
  await tx.delete(journeyLines).where(eq(journeyLines.id, params.lineId))
  await recomputeAndPersistJourneyStatus(tx, line.journeyId)
}

export async function getJourneyWithLinesCore(
  tx: DrizzleTransaction,
  params: { journeyId: string },
): Promise<{ journey: Journey; lines: JourneyLine[] } | null> {
  const [journey] = await tx.select().from(journeys).where(eq(journeys.id, params.journeyId)).limit(1)
  if (!journey) return null
  const lines = await tx
    .select()
    .from(journeyLines)
    .where(eq(journeyLines.journeyId, params.journeyId))
    .orderBy(journeyLines.createdAt)
  return { journey, lines }
}

export async function listJourneysForAgencyCore(
  tx: DrizzleTransaction,
  params: { agencyId: string },
): Promise<Journey[]> {
  return tx
    .select()
    .from(journeys)
    .where(eq(journeys.agencyId, params.agencyId))
    .orderBy(desc(journeys.createdAt))
}

export type CasToProcessingResult =
  | { outcome: "not_found" }
  | { outcome: "already_confirmed"; line: JourneyLine }
  | { outcome: "already_processing" }
  | { outcome: "started"; line: JourneyLine }

/**
 * CAS pending|failed → processing — LA garantie d'idempotence de ce
 * chantier : le moteur réel du module (dispatché ensuite par
 * journey-actions.ts, HORS de cette transaction) n'est appelé QUE si cette
 * fonction retourne `"started"`. Un double-clic/refresh/retry concurrent
 * perd la course (WHERE status = <valeur lue>, UPDATE atomique) et reçoit
 * `"already_processing"` sans jamais déclencher une seconde réservation.
 */
export async function casLineToProcessingCore(
  tx: DrizzleTransaction,
  params: { lineId: string },
): Promise<CasToProcessingResult> {
  const [line] = await tx.select().from(journeyLines).where(eq(journeyLines.id, params.lineId)).limit(1)
  if (!line) return { outcome: "not_found" }
  if (line.status === "confirmed") return { outcome: "already_confirmed", line }
  if (line.status === "processing") return { outcome: "already_processing" }

  const idempotencyKey = `journey-line-confirm:${line.id}:${randomUUID()}`
  const [updated] = await tx
    .update(journeyLines)
    .set({ status: "processing", confirmationIdempotencyKey: idempotencyKey, updatedAt: new Date() })
    .where(and(eq(journeyLines.id, params.lineId), inArray(journeyLines.status, ["pending", "failed"])))
    .returning()

  if (!updated) return { outcome: "already_processing" } // course perdue entre le SELECT et l'UPDATE
  await recomputeAndPersistJourneyStatus(tx, updated.journeyId)
  return { outcome: "started", line: updated }
}

export type LineOutcome =
  | { ok: true; reservationId: string; priceTnd?: number }
  | { ok: false; error: string }

/**
 * Enregistre le résultat RÉEL du moteur (appelé par journey-actions.ts
 * APRÈS le retour du moteur, dans une transaction SÉPARÉE de celle de
 * `casLineToProcessingCore` — jamais la même, voir la doc de tête de
 * journey-actions.ts::confirmJourneyLine pour pourquoi).
 */
export async function recordLineOutcomeCore(
  tx: DrizzleTransaction,
  params: { lineId: string; outcome: LineOutcome },
): Promise<void> {
  const [line] = await tx.select().from(journeyLines).where(eq(journeyLines.id, params.lineId)).limit(1)
  if (!line) throw new Error("LINE_NOT_FOUND")
  // Idempotence défensive : si la ligne est déjà confirmed (ex. un appel
  // concurrent a déjà enregistré le succès), ne jamais écraser.
  if (line.status === "confirmed") return

  if (params.outcome.ok) {
    await tx
      .update(journeyLines)
      .set({
        status: "confirmed",
        reservationId: params.outcome.reservationId,
        errorMessage: null,
        priceTnd: params.outcome.priceTnd !== undefined ? params.outcome.priceTnd.toFixed(2) : line.priceTnd,
        updatedAt: new Date(),
      })
      .where(eq(journeyLines.id, params.lineId))
  } else {
    await tx
      .update(journeyLines)
      .set({ status: "failed", errorMessage: params.outcome.error, updatedAt: new Date() })
      .where(eq(journeyLines.id, params.lineId))
  }
  await recomputeAndPersistJourneyStatus(tx, line.journeyId)
}
