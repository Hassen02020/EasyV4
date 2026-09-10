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

/**
 * Méthodes de règlement manuel staff (Phase 16.2) — couvre le modèle
 * tunisien réel : CASH, BANK_TRANSFER (`transfer`), BANK_DEPOSIT
 * (`deposit`), MANDATE (`mandate`), WALLET, PAY_AT_HOTEL (`at_hotel`).
 * ADVANCE n'est PAS une méthode distincte ici : un versement partiel EST
 * déjà une avance par construction (voir `computeCaptureKind` — le champ
 * `payments.kind` existant, "deposit"/"balance", encode exactement cette
 * distinction, dérivé du solde restant plutôt que choisi par le staff).
 */
export type ManualPaymentMethod = "cash" | "transfer" | "deposit" | "mandate" | "wallet" | "at_hotel"

/** `deposit` (dépôt bancaire) et `mandate` (mandat) n'ont pas de valeur
 * d'enum `payment_method` dédiée — mappés sur `transfer` (canal
 * fonctionnellement identique : un règlement différé prouvé par une
 * référence), la référence fournie par le staff précise le canal réel
 * exact. `wallet`/`at_hotel`/`cash` ont leur propre valeur d'enum déjà
 * existante. Additif : pas de nouvel enum DB (réutilise `payment_method`
 * tel quel). */
export function toPaymentMethod(method: ManualPaymentMethod): "cash" | "transfer" | "wallet" | "at_hotel" {
  if (method === "cash") return "cash"
  if (method === "wallet") return "wallet"
  if (method === "at_hotel") return "at_hotel"
  return "transfer" // deposit | mandate
}

/**
 * `payments.kind` ("deposit" = acompte / "balance" = solde) dérivé
 * server-side du solde restant APRÈS cette capture — jamais choisi par le
 * staff : une capture qui n'épuise pas encore le solde restant est un
 * acompte (ADVANCE), celle qui l'épuise est le règlement du solde.
 */
export function computeCaptureKind(remainingAfterCaptureTnd: number, epsilon: number): "deposit" | "balance" {
  return remainingAfterCaptureTnd > epsilon ? "deposit" : "balance"
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
