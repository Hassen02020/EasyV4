/**
 * CANCEL-POLICY-DISPLAY-01 — interprétation UNIQUE des conditions
 * d'annulation myGo, utilisée par TOUS les écrans (recherche B2C et B2B,
 * fiche hôtel, offre, paiement) et par le filtre « Annulation gratuite ».
 *
 * Sémantique myGo (constatée en production, 2026-11-07) : `cancellationPolicies`
 * liste les PALIERS DE PÉNALITÉ, chacun avec sa date de début (`fromDate`,
 * heure locale Tunisie, format « dd-MM-yyyy HH:mm »). Exemple réel :
 *   [{ fees: 1, type: "NIGHT", nature: "BEFORE_ARRIVAL", fromDate: "13-12-2026 00:00" }]
 * = 1 nuit de frais à partir du 13/12/2026 00:00 ; avant cette date,
 * l'annulation est GRATUITE. L'ancienne règle (« gratuit seulement si un
 * palier à 0 de frais existe ») ne reconnaissait jamais cette période.
 *
 * Aucune valeur inventée : sans palier BEFORE_ARRIVAL exploitable, l'état
 * est UNKNOWN (« conditions sur demande »), jamais « gratuit » ni « non
 * remboursable ».
 */

export type MyGoCancellationKind =
  | "FREE" // tous les paliers avant arrivée sont à 0 de frais
  | "FREE_UNTIL" // gratuit jusqu'au premier palier payant (date future)
  | "PENALTY" // le premier palier payant a déjà commencé
  | "NON_REFUNDABLE" // tarif non remboursable (myGo NotRefundable)
  | "UNKNOWN" // aucune information exploitable

export interface MyGoCancellationSummary {
  kind: MyGoCancellationKind
  /** Début du premier palier payant (ISO, fuseau Tunisie) — FREE_UNTIL / PENALTY. */
  penaltyFrom?: string
  /** Dernier instant d'annulation gratuite (ISO) — FREE_UNTIL uniquement. */
  freeUntil?: string
}

interface PolicyLike {
  fees: number
  nature: string
  fromDate?: string | null
}

interface RoomLike {
  notRefundable: boolean
  cancellationPolicies: PolicyLike[]
}

/** Tunisie : UTC+1 toute l'année (pas d'heure d'été). */
const TUNIS_OFFSET = "+01:00"

/** « 13-12-2026 00:00 » (heure de Tunis) → Date, ou null si illisible. */
export function parseMyGoDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const m = /^(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{2}):(\d{2}))?$/.exec(
    value.trim(),
  )
  if (!m) return null
  const [, dd, mm, yyyy, hh = "00", mi = "00"] = m
  const d = new Date(`${yyyy}-${mm}-${dd}T${hh}:${mi}:00${TUNIS_OFFSET}`)
  return Number.isNaN(d.getTime()) ? null : d
}

export function summarizeMyGoCancellation(
  room: RoomLike,
  now: Date = new Date(),
): MyGoCancellationSummary {
  if (room.notRefundable) return { kind: "NON_REFUNDABLE" }
  const beforeArrival = room.cancellationPolicies.filter(
    (p) => p.nature === "BEFORE_ARRIVAL",
  )
  if (beforeArrival.length === 0) return { kind: "UNKNOWN" }
  const paid = beforeArrival.filter((p) => p.fees > 0)
  if (paid.length === 0) return { kind: "FREE" }
  const dates = paid.map((p) => parseMyGoDate(p.fromDate))
  // Un palier payant sans date lisible : impossible de savoir jusqu'à quand
  // c'est gratuit → UNKNOWN, jamais une date devinée.
  if (dates.some((d) => d === null)) return { kind: "UNKNOWN" }
  const first = new Date(Math.min(...dates.map((d) => d!.getTime())))
  if (now.getTime() >= first.getTime()) {
    return { kind: "PENALTY", penaltyFrom: first.toISOString() }
  }
  return {
    kind: "FREE_UNTIL",
    penaltyFrom: first.toISOString(),
    freeUntil: new Date(first.getTime() - 60_000).toISOString(),
  }
}

export function isFreeCancellation(summary: MyGoCancellationSummary): boolean {
  return summary.kind === "FREE" || summary.kind === "FREE_UNTIL"
}

/** Date + heure de fin d'annulation gratuite, en heure de Tunis. */
export function formatFreeCancellationUntil(
  iso: string | null | undefined,
  locale: string,
): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Tunis",
  }).format(d)
}
