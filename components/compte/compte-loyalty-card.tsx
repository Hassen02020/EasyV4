import { Gift } from "lucide-react"
import { pointsToTndEquivalent, MIN_REDEMPTION_POINTS } from "@/lib/loyalty/rewards-core"
import { CompteLoyaltyRedeemForm } from "@/components/compte/compte-loyalty-redeem-form"
import type { LoyaltyHistoryEntryDTO } from "@/app/actions/get-my-loyalty-history"

/**
 * Easy2Book Rewards — affichage `/compte` (Phase 38D, historique +
 * rédemption ajoutés Phase 38E). Solde et historique restent purement
 * server-authoritative (`getMyLoyaltySummary`/`getMyLoyaltyHistory`,
 * lecture seule) — jamais un solde calculé/maintenu côté client.
 *
 * La rédemption (`redeemMyLoyaltyPoints` → `redeemPoints`) reste un
 * mouvement de GRAND LIVRE uniquement — voir la doc de tête de
 * lib/loyalty/rewards-core.ts : `tndEquivalent` est informatif, jamais
 * branché au montant réellement encaissé au checkout (hors périmètre V1).
 */

const HISTORY_LABELS: Record<LoyaltyHistoryEntryDTO["type"], string> = {
  earn_pending: "Points gagnés (en attente)",
  convert_available_in: "Points disponibles (séjour terminé)",
  redeem: "Points utilisés",
  reverse_pending: "Points repris (annulation)",
  reverse_available: "Points repris (annulation)",
  reinstate: "Points restitués (annulation)",
  expire: "Points expirés (inactivité)",
}

function formatHistoryDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-TN", { day: "numeric", month: "short", year: "numeric" })
}

export function CompteLoyaltyCard({
  pendingPoints,
  availablePoints,
  history,
  eligibleReservations,
}: {
  pendingPoints: number
  availablePoints: number
  history: LoyaltyHistoryEntryDTO[]
  eligibleReservations: { id: string; publicRef: string; module: string }[]
}) {
  const hasPoints = pendingPoints > 0 || availablePoints > 0

  return (
    <div className="bg-card border-border mb-6 rounded-2xl border p-4">
      <div className="mb-2 flex items-center gap-2">
        <Gift className="text-accent h-4 w-4" />
        <span className="text-foreground text-sm font-semibold">Easy2Book Rewards</span>
      </div>

      {!hasPoints ? (
        <p className="text-muted-foreground text-sm">
          Vous n&apos;avez pas encore de points. Réservez un hôtel, un voyage organisé ou une activité pour
          commencer à en gagner — 1 DT dépensé = 1 point.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <div>
              <span className="text-foreground text-2xl font-bold">{availablePoints}</span>
              <span className="text-muted-foreground ml-1.5 text-sm">
                points disponibles (≈ {pointsToTndEquivalent(availablePoints).toFixed(2)} DT)
              </span>
            </div>
            {pendingPoints > 0 && (
              <div>
                <span className="text-muted-foreground text-sm">
                  + {pendingPoints} points en attente (dès la fin de votre séjour)
                </span>
              </div>
            )}
          </div>
          {availablePoints < MIN_REDEMPTION_POINTS && (
            <p className="text-muted-foreground mt-2 text-xs">
              Rédemption possible à partir de {MIN_REDEMPTION_POINTS} points disponibles.
            </p>
          )}
          <CompteLoyaltyRedeemForm availablePoints={availablePoints} reservations={eligibleReservations} />
        </>
      )}

      {history.length > 0 && (
        <div className="mt-4 border-t pt-3">
          <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
            Activité récente
          </p>
          <ul className="space-y-1.5">
            {history.map((entry, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-xs">
                <span className="text-foreground">
                  {HISTORY_LABELS[entry.type]}
                  {entry.reservationPublicRef ? ` — ${entry.reservationPublicRef}` : ""}
                </span>
                <span className="flex items-center gap-2 whitespace-nowrap">
                  <span className={entry.points >= 0 ? "text-emerald-600" : "text-destructive"}>
                    {entry.points >= 0 ? "+" : ""}
                    {entry.points}
                  </span>
                  <span className="text-muted-foreground">{formatHistoryDate(entry.createdAt)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
