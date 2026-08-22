/**
 * Logique pure de vérification de paiement manuel — extraite de
 * `manual-payment-actions.ts` ("use server", ne peut exporter que des
 * fonctions async — voir lib/admin/reservation-status.ts pour le même
 * motif) pour rester testable en isolation sous `node --test`.
 */

/**
 * Rôles staff autorisés à valider un règlement manuel — plus restrictif que
 * `updateReservationStatus` (qui accepte tout profil admin) : une opération
 * financière exige un rôle avec responsabilité financière/réservation, pas
 * `agent_excursions` ni un profil partenaire B2B.
 */
export const MANUAL_PAYMENT_ALLOWED_ROLES = [
  "super_admin",
  "manager",
  "agent_resa",
  "agent_compta",
] as const

export type ManualPaymentMethod = "cash" | "transfer" | "deposit"

/** `deposit` (dépôt bancaire) n'a pas de valeur d'enum `payment_method`
 * dédiée — mappé sur `transfer` (canal fonctionnellement identique : un
 * règlement différé prouvé par une référence de dépôt), la référence
 * fournie par le staff précise le canal réel. Additif : pas de nouvel enum. */
export function toPaymentMethod(method: ManualPaymentMethod): "cash" | "transfer" {
  return method === "cash" ? "cash" : "transfer"
}

/**
 * Vrai si une réservation `pending` a dépassé sa fenêtre de règlement —
 * server-authoritative, utilisé à la fois par le cron
 * (/api/cron/expire-pending-payments) et en garde défensive dans
 * `verifyManualPayment` (au cas où le cron n'est pas encore passé).
 */
export function isPastPaymentDeadline(paymentExpiresAt: Date | null, now: Date = new Date()): boolean {
  if (!paymentExpiresAt) return false
  return paymentExpiresAt.getTime() < now.getTime()
}
