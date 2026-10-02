/**
 * Écriture de `reservation_status_history` + application de la state
 * machine (`isTransitionAllowed`, lib/admin/reservation-status.ts) à chaque
 * point d'écriture réel de `reservations.status`.
 *
 * Séparé de `reservation-status.ts` (logique pure, importable côté client
 * pour l'UI) parce que ce fichier touche la DB — jamais importé ailleurs
 * que par du code serveur ("use server" actions, routes API, jobs Inngest).
 *
 * chantier-49A : avant ce fichier, `isTransitionAllowed()` n'était invoquée
 * que dans lib/admin/actions.ts — les ~20 autres points d'écriture de
 * `reservations.status` (booking/guest/packages/omra/cars/activities/
 * transferts/vols, cancel/refund) faisaient un `.update().set({status})`
 * direct, sans garde ni trace. `reservation_status_history` était déclarée
 * dans le schéma mais jamais écrite par aucun flux réel (confirmé par grep).
 */

import {
  reservationStatusHistory,
  reservationTransition,
} from "@/lib/db/schema"
import {
  isTransitionAllowed,
  type ReservationStatus,
} from "./reservation-status"
import type { DrizzleTransaction } from "@/lib/db/client"

type TransitionLabel = (typeof reservationTransition.enumValues)[number]

/**
 * Libellé sémantique associé à CHAQUE statut cible réellement écrit par le
 * code (voir audit chantier-49A). `no_show` n'a aucun point d'écriture
 * réel dans le dépôt (confirmé par grep) — volontairement absent ici.
 */
const TRANSITION_LABEL_BY_TARGET: Partial<
  Record<ReservationStatus, TransitionLabel>
> = {
  pending: "create",
  confirmed: "payment_success",
  on_request: "await_provider",
  cancelled: "cancel",
  completed: "complete",
  refunded: "refund",
  expired: "expire",
}

export class IllegalReservationTransitionError extends Error {
  constructor(
    public readonly reservationId: string,
    public readonly from: ReservationStatus,
    public readonly to: ReservationStatus,
  ) {
    super(
      `Transition de statut refusée pour la réservation ${reservationId} : ${from} → ${to}.`,
    )
    this.name = "IllegalReservationTransitionError"
  }
}

export type RecordReservationTransitionInput = {
  reservationId: string
  from: ReservationStatus
  to: ReservationStatus
  /** UUID de l'utilisateur à l'origine du changement, ou `null`/omis si automatique (webhook, job, sync fournisseur). */
  triggeredBy?: string | null
  /** `true` pour un changement déclenché par un système automatisé (webhook paiement, sync statut vol, expiration…) plutôt qu'une action humaine. */
  automated?: boolean
  reason?: string
  metadata?: Record<string, unknown>
}

/**
 * Valide la transition (lève `IllegalReservationTransitionError` si non
 * autorisée par la state machine) puis insère la ligne d'audit
 * correspondante dans `reservation_status_history`.
 *
 * N'effectue PAS le `.update(reservations).set({status})` lui-même —
 * l'appelant garde le contrôle total de sa transaction (verrous déjà
 * posés, autres colonnes à mettre à jour dans le même UPDATE comme
 * `confirmedAt`/`cancelledAt`). À appeler juste avant (ou juste après,
 * dans la même transaction) le véritable UPDATE.
 */
export async function recordReservationTransition(
  tx: DrizzleTransaction,
  input: RecordReservationTransitionInput,
): Promise<void> {
  if (!isTransitionAllowed(input.from, input.to)) {
    throw new IllegalReservationTransitionError(
      input.reservationId,
      input.from,
      input.to,
    )
  }
  const transition = TRANSITION_LABEL_BY_TARGET[input.to]
  if (!transition) {
    throw new Error(
      `Aucun libellé de transition (reservation_transition) connu pour le statut cible "${input.to}". ` +
        `Ajoute-le à TRANSITION_LABEL_BY_TARGET (lib/admin/reservation-status-history.ts) et, si besoin, à ` +
        `l'enum reservation_transition (migration Drizzle) avant d'écrire ce statut.`,
    )
  }
  await tx.insert(reservationStatusHistory).values({
    reservationId: input.reservationId,
    fromStatus: input.from,
    toStatus: input.to,
    transition,
    triggeredBy: input.triggeredBy ?? null,
    automated: input.automated ?? false,
    reason: input.reason,
    metadata: input.metadata,
  })
}
