/**
 * CANCEL-POLICY-DISPLAY-01 — lecture UNIQUE de la condition d'annulation
 * hôtel portée par le brouillon (posée par la fiche hôtel / la recherche à
 * partir de lib/mygo/cancellation.ts). Utilisée par la page de l'offre et
 * la page de paiement : les deux affichent donc toujours la même chose.
 *
 * Brouillon antérieur sans `cancellationKind` : `hasFreeCancellation=false`
 * ne prouve PAS un tarif non remboursable (ancienne règle erronée) → état
 * « sur demande », jamais une affirmation inventée.
 */
import type { BookingDraft } from "./schemas"

export type DraftHotelCancellationKind =
  | "FREE"
  | "NON_REFUNDABLE"
  | "PENALTY"
  | "UNKNOWN"

export interface DraftHotelCancellation {
  kind: DraftHotelCancellationKind
  hasFreeCancellation: boolean
  /** ISO — « gratuit avant le … », seulement pour FREE avec date. */
  freeCancellationDate?: string
}

const KINDS: readonly string[] = [
  "FREE",
  "NON_REFUNDABLE",
  "PENALTY",
  "UNKNOWN",
]

export function readDraftHotelCancellation(
  draft: Pick<BookingDraft, "module" | "metadata">,
): DraftHotelCancellation | undefined {
  if (draft.module !== "hotel") return undefined
  const m = (draft.metadata ?? {}) as Record<string, unknown>
  const rawKind =
    typeof m.cancellationKind === "string" ? m.cancellationKind : null
  let kind: DraftHotelCancellationKind
  if (rawKind && KINDS.includes(rawKind)) {
    kind = rawKind as DraftHotelCancellationKind
  } else if (typeof m.hasFreeCancellation === "boolean") {
    kind = m.hasFreeCancellation ? "FREE" : "UNKNOWN"
  } else {
    return undefined
  }
  const date =
    kind === "FREE" && typeof m.freeCancellationDate === "string"
      ? m.freeCancellationDate
      : undefined
  return {
    kind,
    hasFreeCancellation: kind === "FREE",
    ...(date ? { freeCancellationDate: date } : {}),
  }
}
