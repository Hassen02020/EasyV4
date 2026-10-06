/**
 * CAMPAIGN-ATTRIBUTION-01 — relie une réservation réelle (BOOKING) à la
 * campagne qui l'a générée, de façon STABLE ET TRAÇABLE (écrite une
 * seule fois, jamais recalculée à la lecture).
 *
 * Audit de conception dédié (docs/ROADMAP.md) : BOOKING n'est JAMAIS
 * modifié par ce module — aucune écriture dans `reservations`/
 * `customers`, uniquement des lectures. CAMPAIGN reste seul propriétaire
 * de `campaign_attributions`. Le rapprochement réutilise la normalisation
 * CONTACT-01 (`resolveContactKeyCore`) — jamais une seconde logique de
 * normalisation.
 *
 * Règle de sélection déterministe, actée par l'utilisateur (2026-10-06) :
 * parmi les campagnes dont le contact fait partie de `campaign_targets`,
 * encore éligibles (statut 'active'/'completed'), et dont la fenêtre
 * [snapshotAt, endAt ?? +∞] couvre `reservation.createdAt` — le
 * snapshot le plus RÉCENT gagne ; égalité parfaite → `campaignId` le
 * plus petit (tie-breaker stable).
 *
 * Seules les réservations en statut 'confirmed'/'completed' sont
 * attribuées — décision complémentaire, non posée par l'utilisateur,
 * tranchée ici et signalée explicitement : une réservation 'pending'/
 * 'cancelled'/'expired'/'refunded'/'no_show' n'a pas eu lieu
 * commercialement, jamais attribuée à sa création. Si elle devient
 * 'confirmed' plus tard, elle devient éligible à ce moment (relecture
 * par un passage ultérieur du job).
 *
 * PAS un fichier `"use server"` (même convention que les autres modules
 * -core.ts de ce dépôt).
 */

import { and, desc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import {
  campaignAttributions,
  campaigns,
  campaignTargets,
  contacts,
  customers,
  reservations,
} from "@/lib/db/schema"
import { resolveContactKeyCore } from "./contact-core"

/** Réservations commercialement réalisées — jamais une réservation encore incertaine ou annulée. */
const ATTRIBUTABLE_RESERVATION_STATUSES = ["confirmed", "completed"] as const

export interface AttributionCandidate {
  campaignId: string
  contactId: string
  snapshotAt: Date
  endAt: Date | null
}

/**
 * Fonction pure — sélectionne la campagne gagnante parmi les candidats
 * déjà filtrés (fenêtre temporelle déjà appliquée par l'appelant).
 * Snapshot le plus récent gagne ; égalité parfaite → campaignId le plus
 * petit (ordre lexicographique, déterministe).
 */
export function selectAttributionCandidateCore(
  candidates: AttributionCandidate[],
): AttributionCandidate | null {
  if (candidates.length === 0) return null
  return candidates.reduce((best, current) => {
    if (current.snapshotAt.getTime() > best.snapshotAt.getTime()) {
      return current
    }
    if (
      current.snapshotAt.getTime() === best.snapshotAt.getTime() &&
      current.campaignId < best.campaignId
    ) {
      return current
    }
    return best
  })
}

export type AttributeReservationResult =
  | { ok: true; attributed: true; campaignId: string }
  | { ok: true; attributed: false; reason: "ALREADY_ATTRIBUTED" | "NO_MATCH" }
  | { ok: false; code: "RESERVATION_NOT_FOUND" }

/**
 * Calcule et écrit (une seule fois) l'attribution d'UNE réservation.
 * Idempotent : un second appel sur une réservation déjà attribuée ne
 * fait rien (ALREADY_ATTRIBUTED), jamais une réécriture.
 */
export async function attributeReservationCore(
  tx: DrizzleTransaction,
  params: { agencyId: string; reservationId: string },
): Promise<AttributeReservationResult> {
  const [reservation] = await tx
    .select({
      id: reservations.id,
      customerId: reservations.customerId,
      createdAt: reservations.createdAt,
      status: reservations.status,
    })
    .from(reservations)
    .where(
      and(
        eq(reservations.id, params.reservationId),
        eq(reservations.agencyId, params.agencyId),
      ),
    )
    .limit(1)

  if (!reservation) return { ok: false, code: "RESERVATION_NOT_FOUND" }

  if (
    !(ATTRIBUTABLE_RESERVATION_STATUSES as readonly string[]).includes(
      reservation.status,
    )
  ) {
    return { ok: true, attributed: false, reason: "NO_MATCH" }
  }

  const [existing] = await tx
    .select({ id: campaignAttributions.id })
    .from(campaignAttributions)
    .where(eq(campaignAttributions.reservationId, params.reservationId))
    .limit(1)
  if (existing) {
    return { ok: true, attributed: false, reason: "ALREADY_ATTRIBUTED" }
  }

  const [customer] = await tx
    .select({ email: customers.email, phone: customers.phone })
    .from(customers)
    .where(eq(customers.id, reservation.customerId))
    .limit(1)
  if (!customer) return { ok: true, attributed: false, reason: "NO_MATCH" }

  const emailRef = customer.email
    ? resolveContactKeyCore("email", customer.email)
    : null
  const phoneRef = customer.phone
    ? resolveContactKeyCore("whatsapp", customer.phone)
    : null

  if (!emailRef && !phoneRef) {
    return { ok: true, attributed: false, reason: "NO_MATCH" }
  }

  const matchedContacts = await tx
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      and(
        eq(contacts.agencyId, params.agencyId),
        or(
          emailRef
            ? and(
                eq(contacts.channel, "email"),
                eq(contacts.contactRef, emailRef),
              )
            : undefined,
          phoneRef
            ? and(
                inArray(contacts.channel, ["whatsapp", "call"]),
                eq(contacts.contactRef, phoneRef),
              )
            : undefined,
        ),
      ),
    )

  if (matchedContacts.length === 0) {
    return { ok: true, attributed: false, reason: "NO_MATCH" }
  }
  const contactIds = matchedContacts.map((c) => c.id)

  const rows = await tx
    .select({
      campaignId: campaignTargets.campaignId,
      contactId: campaignTargets.contactId,
      snapshotAt: campaignTargets.snapshotAt,
      campaignStatus: campaigns.status,
      campaignEndAt: campaigns.endAt,
    })
    .from(campaignTargets)
    .innerJoin(campaigns, eq(campaigns.id, campaignTargets.campaignId))
    .where(
      and(
        eq(campaignTargets.agencyId, params.agencyId),
        inArray(campaignTargets.contactId, contactIds),
        inArray(campaigns.status, ["active", "completed"]),
        lte(campaignTargets.snapshotAt, reservation.createdAt),
        or(
          isNull(campaigns.endAt),
          gte(campaigns.endAt, reservation.createdAt),
        ),
      ),
    )

  const winner = selectAttributionCandidateCore(
    rows.map((r) => ({
      campaignId: r.campaignId,
      contactId: r.contactId,
      snapshotAt: r.snapshotAt,
      endAt: r.campaignEndAt,
    })),
  )

  if (!winner) {
    return { ok: true, attributed: false, reason: "NO_MATCH" }
  }

  await tx
    .insert(campaignAttributions)
    .values({
      agencyId: params.agencyId,
      campaignId: winner.campaignId,
      contactId: winner.contactId,
      reservationId: params.reservationId,
    })
    .onConflictDoNothing()

  return { ok: true, attributed: true, campaignId: winner.campaignId }
}

export interface AttributeNewReservationsResult {
  scanned: number
  attributed: number
}

/**
 * Appelée par le cron (app/api/cron/attribute-campaign-conversions) —
 * balaie TOUTES les réservations sans attribution encore calculée,
 * TOUTES AGENCES confondues (même convention que les crons existants,
 * ex. expire-pending-payments : jamais de boucle par agence), tous
 * modules confondus (hotel/flight/transfer/omra/package/activity/car/
 * network) : ne dépend d'AUCUN événement Inngest, donc jamais incomplet
 * selon le module, contrairement aux 4 événements `booking/*.confirmed`
 * qui ne couvrent pas tous les modules.
 */
export async function attributeNewReservationsCore(
  tx: DrizzleTransaction,
  params: { limit?: number } = {},
): Promise<AttributeNewReservationsResult> {
  const candidateReservations = await tx
    .select({ id: reservations.id, agencyId: reservations.agencyId })
    .from(reservations)
    .leftJoin(
      campaignAttributions,
      eq(campaignAttributions.reservationId, reservations.id),
    )
    .where(
      and(
        isNull(campaignAttributions.id),
        inArray(reservations.status, [...ATTRIBUTABLE_RESERVATION_STATUSES]),
      ),
    )
    .orderBy(desc(reservations.createdAt))
    .limit(params.limit ?? 500)

  let attributed = 0
  for (const r of candidateReservations) {
    const result = await attributeReservationCore(tx, {
      agencyId: r.agencyId,
      reservationId: r.id,
    })
    if (result.ok && result.attributed) attributed += 1
  }

  return { scanned: candidateReservations.length, attributed }
}
