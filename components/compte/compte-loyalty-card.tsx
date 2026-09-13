import { Gift } from "lucide-react"
import { useTranslations, useLocale } from "next-intl"
import { pointsToTndEquivalent, MIN_REDEMPTION_POINTS } from "@/lib/loyalty/rewards-core"
import { CompteLoyaltyRedeemForm } from "@/components/compte/compte-loyalty-redeem-form"
import { getIntlLocale } from "@/lib/i18n-date"
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
  const t = useTranslations("Compte")
  const locale = useLocale()

  const HISTORY_LABELS: Record<LoyaltyHistoryEntryDTO["type"], string> = {
    earn_pending: t("historyEarnPending"),
    convert_available_in: t("historyConvertAvailable"),
    redeem: t("historyRedeem"),
    reverse_pending: t("historyReversePending"),
    reverse_available: t("historyReverseAvailable"),
    reinstate: t("historyReinstate"),
    expire: t("historyExpire"),
  }

  function formatHistoryDate(iso: string): string {
    return new Date(iso).toLocaleDateString(getIntlLocale(locale), { day: "numeric", month: "short", year: "numeric" })
  }

  const hasPoints = pendingPoints > 0 || availablePoints > 0

  return (
    <div className="bg-card border-border mb-6 rounded-2xl border p-4">
      <div className="mb-2 flex items-center gap-2">
        <Gift className="text-accent h-4 w-4" />
        <span className="text-foreground text-sm font-semibold">{t("rewardsTitle")}</span>
      </div>

      {!hasPoints ? (
        <p className="text-muted-foreground text-sm">
          {t("noPointsYet")}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <div>
              <span className="text-foreground text-2xl font-bold">{availablePoints}</span>
              <span className="text-muted-foreground ml-1.5 text-sm">
                {t("pointsAvailableSuffix", { n: availablePoints, tnd: pointsToTndEquivalent(availablePoints).toFixed(2) })}
              </span>
            </div>
            {pendingPoints > 0 && (
              <div>
                <span className="text-muted-foreground text-sm">
                  {t("pendingPointsNotice", { n: pendingPoints })}
                </span>
              </div>
            )}
          </div>
          {availablePoints < MIN_REDEMPTION_POINTS && (
            <p className="text-muted-foreground mt-2 text-xs">
              {t("redemptionThreshold", { min: MIN_REDEMPTION_POINTS })}
            </p>
          )}
          <CompteLoyaltyRedeemForm availablePoints={availablePoints} reservations={eligibleReservations} />
        </>
      )}

      {history.length > 0 && (
        <div className="mt-4 border-t pt-3">
          <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
            {t("recentActivityTitle")}
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
