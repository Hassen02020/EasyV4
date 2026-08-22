/**
 * Statut d'annulation honnête, dérivé de `RoomOfferDTO.notRefundable` +
 * `cancellationPolicies` (déjà normalisés par myGo, jamais fabriqués) :
 *   - "free"          : au moins une politique BEFORE_ARRIVAL sans frais —
 *                        annulation gratuite avant `beforeDate`.
 *   - "non_refundable": `notRefundable === true` côté fournisseur.
 *   - "unknown"        : ni l'un ni l'autre — myGo n'a communiqué aucune
 *                        politique exploitable, on ne l'invente pas.
 */
export type CancellationStatus =
  | { kind: "free"; beforeDate: string }
  | { kind: "non_refundable" }
  | { kind: "unknown" }

/** Dérive un statut d'annulation honnête depuis les données myGo — jamais un badge par défaut fabriqué. */
export function cancellationStatusFor(room: {
  notRefundable: boolean
  cancellationPolicies: { nature: string; fees: number; fromDate?: string }[]
}): CancellationStatus {
  if (room.notRefundable) return { kind: "non_refundable" }
  const freePolicy = room.cancellationPolicies.find(
    (p) => p.nature === "BEFORE_ARRIVAL" && p.fees === 0 && p.fromDate,
  )
  if (freePolicy?.fromDate) return { kind: "free", beforeDate: freePolicy.fromDate }
  return { kind: "unknown" }
}
