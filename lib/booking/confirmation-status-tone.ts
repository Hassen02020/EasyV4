/**
 * UI-LOT2A — correspondance statut de réservation → ton de StatusBadge.
 *
 * Affichage seulement : aucun statut n'est créé ni renommé. Un statut inconnu
 * reste visible (libellé brut) avec le ton neutre.
 */
export type ConfirmationStatusTone =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral"

const TONES: Record<string, ConfirmationStatusTone> = {
  pending: "warning",
  on_request: "info",
  confirmed: "success",
  completed: "success",
  cancelled: "danger",
  refunded: "neutral",
  no_show: "neutral",
}

export function confirmationStatusTone(status: string): ConfirmationStatusTone {
  return Object.hasOwn(TONES, status) ? TONES[status] : "neutral"
}
