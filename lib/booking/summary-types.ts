/**
 * Types partagés pour l'affichage d'un résumé de réservation côté client
 * (B2C) — utilisés à la fois par le lookup anonyme (`app/actions/
 * lookup-booking.ts`, ref + email) et par l'historique du compte client
 * authentifié (`app/actions/list-my-reservations.ts`). Un seul contrat pour
 * ne jamais laisser diverger les deux chemins d'accès à la même donnée.
 */

export type BookingStatus =
  | "pending"
  | "on_request"
  | "confirmed"
  | "cancelled"
  | "refunded"
  | "no_show"
  | "expired"
  | "completed"

/** Politique d'annulation FIGÉE au moment de la réservation (Omra/Package/Activity uniquement — voir lib/booking/policy-engine.ts). `undefined` = module non concerné (ex. hôtel, régi par myGo) ; `null` = aucune politique n'était définie au moment de cette réservation. */
export interface BookingCancellationPolicySummary {
  cancellable: boolean
  modifiable: boolean
  deadlineHours: number | null
  cancellationFeePercent: number | null
  refundAllowed: boolean
  creditAllowed: boolean
  nonRefundable: boolean
}

export interface BookingSummary {
  id: string
  publicRef: string
  module: string
  status: BookingStatus
  originalAmount: string
  originalCurrency: string
  tndAmount: string
  createdAt: string
  confirmedAt: string | null
  cancelledAt: string | null
  /** Deadline de règlement manuel (cash/virement) — `null` si non applicable (carte, ou déjà réglé). */
  paymentExpiresAt: string | null
  /** Dernier paiement associé (le plus récent), pour affichage méthode/statut. */
  payment: { method: string; status: string } | null
  /** Vrai seulement si un adaptateur de paiement réel est configuré (STRIPE_SECRET_KEY/SPS_SECRET_KEY) — jamais fabriqué. */
  onlinePaymentAvailable: boolean
  /**
   * Second facteur d'accès aux téléchargements guest (voucher/facture) —
   * même mécanisme que `/booking/confirmation/[ref]` (Phase 21.1) : jamais
   * `publicRef` seul.
   */
  guestAccessToken: string
  /** Vrai seulement si une facture a réellement été émise (`findInvoiceForReservation`) — jamais déduit du statut seul. */
  hasInvoice: boolean
  customer: {
    firstName: string
    lastName: string
    email: string
    phone: string | null
  }
  /** Omra/Package/Activity uniquement — `undefined` pour les autres modules. */
  cancellationPolicy?: BookingCancellationPolicySummary | null
  /** Vrai si un avis existe déjà pour cette réservation (peu importe son statut de modération) — jamais un second avis. */
  hasReview: boolean
}
