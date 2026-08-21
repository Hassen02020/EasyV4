/**
 * Configuration partagée des statuts de réservation Omra (labels + couleurs).
 * Client-safe (aucune dépendance serveur).
 */

export type OmraStatusKey =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "completed"
  | "on_request"
  | "no_show"
  | "refunded"

export const OMRA_STATUS_CONFIG: Record<
  string,
  { label: string; badgeClass: string }
> = {
  pending: {
    label: "En attente",
    badgeClass: "bg-amber-100 text-amber-800 border-amber-200",
  },
  confirmed: {
    label: "Confirmée",
    badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-200",
  },
  cancelled: {
    label: "Annulée",
    badgeClass: "bg-red-100 text-red-800 border-red-200",
  },
  completed: {
    label: "Complétée",
    badgeClass: "bg-blue-100 text-blue-800 border-blue-200",
  },
  on_request: {
    label: "Sur demande",
    badgeClass: "bg-sky-100 text-sky-800 border-sky-200",
  },
  no_show: {
    label: "No-show",
    badgeClass: "bg-gray-100 text-gray-700 border-gray-200",
  },
  refunded: {
    label: "Remboursée",
    badgeClass: "bg-gray-100 text-gray-700 border-gray-200",
  },
}

export function omraStatusConfig(status: string) {
  return (
    OMRA_STATUS_CONFIG[status] ?? {
      label: status,
      badgeClass: "bg-gray-100 text-gray-700 border-gray-200",
    }
  )
}

/** Libellés d'action pour l'historique. */
export const OMRA_HISTORY_ACTION_LABEL: Record<string, string> = {
  create: "Création",
  confirm: "Confirmation",
  cancel: "Annulation",
  complete: "Clôture",
  note: "Note interne",
  update: "Modification",
}
