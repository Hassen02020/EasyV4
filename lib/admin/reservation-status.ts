/**
 * State machine pure des transitions de statut d'une réservation.
 *
 * Séparée de `actions.ts` parce que les fichiers "use server" ne peuvent
 * exporter que des fonctions async. On a besoin de la logique synchrone
 * pour les tests unitaires et pour la validation côté client (UI).
 */

export const RESERVATION_STATUSES = [
  "pending",
  "on_request",
  "confirmed",
  "cancelled",
  "no_show",
  "completed",
  "refunded",
  "expired",
] as const

export type ReservationStatus = (typeof RESERVATION_STATUSES)[number]

/**
 * Transitions autorisées depuis chaque statut.
 *
 * Règles métier :
 *  - pending     -> confirmed, on_request, cancelled, expired
 *  - on_request  -> confirmed, cancelled
 *  - confirmed   -> cancelled, completed, refunded
 *  - cancelled   -> pending (réouverture exceptionnelle)
 *  - no_show     -> refunded
 *  - completed   -> refunded
 *  - refunded    -> (terminal)
 *  - expired     -> (terminal — Wallet/Payment Core : ne peut plus être
 *                    payée, validée par le staff, ni recevoir de voucher
 *                    ou de confirmation ; voir isTransitionAllowed)
 */
const ALLOWED_TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  pending: ["confirmed", "on_request", "cancelled", "expired"],
  on_request: ["confirmed", "cancelled"],
  confirmed: ["cancelled", "completed", "refunded"],
  cancelled: ["pending"],
  no_show: ["refunded"],
  completed: ["refunded"],
  refunded: [],
  expired: [],
}

export function isTransitionAllowed(
  from: ReservationStatus,
  to: ReservationStatus,
): boolean {
  if (from === to) return false
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false
}

/**
 * Liste les statuts cibles autorisés depuis l'état courant.
 * Utilisé côté UI pour ne montrer que les transitions valides dans le
 * dropdown "Changer statut…" du back-office.
 */
export function getAllowedTransitions(
  from: ReservationStatus,
): ReservationStatus[] {
  return ALLOWED_TRANSITIONS[from] ?? []
}

/**
 * Rôles staff autorisés à changer le statut d'une réservation (y compris
 * annuler, qui déclenche un remboursement dans la même transaction — voir
 * `lib/admin/actions.ts::updateReservationStatus`). Phase 21.2 : cette
 * liste existait déjà, mais UNIQUEMENT comme garde d'affichage de page
 * (`app/admin/reservations/page.tsx`) — la Server Action elle-même
 * n'imposait aucun rôle, seulement un profil admin résolu avec une
 * agence. Un Server Action Next.js reste directement appelable (POST)
 * indépendamment de la page qui l'invoque normalement : un `agent_compta`
 * ou `agent_excursions` (jamais censés voir cette page ni gérer des
 * réservations) pouvait donc annuler une réservation en appelant l'action
 * directement. Extrait ici (même motif que `MANUAL_PAYMENT_ALLOWED_ROLES`/
 * `REFUND_ALLOWED_ROLES`) pour être la même source de vérité des deux
 * côtés — page ET action — au lieu d'un doublon qui pouvait diverger.
 */
export const RESERVATION_STATUS_ALLOWED_ROLES = ["super_admin", "manager", "agent_resa"] as const
