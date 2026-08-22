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
