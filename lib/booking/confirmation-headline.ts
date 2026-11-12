/**
 * CONFIRMATION-TITLE-TRUTH-01 — titre et icône de la page de confirmation
 * déduits du VRAI statut de la réservation. « Confirmée » n'est jamais
 * affiché pour un statut qui n'est pas confirmed/completed ; un statut
 * inconnu retombe sur un titre neutre.
 */
export type ConfirmationHeadline = {
  kind: "confirmed" | "pending" | "cancelled" | "neutral"
  titleKey:
    | "confirmedTitle"
    | "headlinePendingTitle"
    | "headlineCancelledTitle"
    | "headlineNeutralTitle"
}

export function confirmationHeadline(status: string): ConfirmationHeadline {
  switch (status) {
    case "confirmed":
    case "completed":
      return { kind: "confirmed", titleKey: "confirmedTitle" }
    case "pending":
    case "on_request":
      return { kind: "pending", titleKey: "headlinePendingTitle" }
    case "cancelled":
      return { kind: "cancelled", titleKey: "headlineCancelledTitle" }
    default:
      return { kind: "neutral", titleKey: "headlineNeutralTitle" }
  }
}
