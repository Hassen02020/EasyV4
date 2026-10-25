import { getTranslations } from "next-intl/server"
import {
  TOPUP_METHOD_LABEL_KEYS,
  TOPUP_STATUS_LABEL_KEYS,
  type TopupMethodKey,
} from "@/lib/finance/topup-method-display"

export interface TopupRequestRow {
  id: string
  amount: string
  method: string
  status: string
  customerReference: string | null
  rejectionReason: string | null
  createdAt: Date
}

const STATUS_CLASS: Record<string, string> = {
  pending:
    "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  completed:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  rejected: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  failed: "bg-muted text-muted-foreground",
}

/** Demandes de recharge du client (statut réel en base, motif de rejet). */
export async function WalletTopupRequests({
  requests,
  locale,
}: {
  requests: TopupRequestRow[]
  locale: string
}) {
  if (requests.length === 0) return null
  const t = await getTranslations("Compte")
  const dtFormat = new Intl.DateTimeFormat(
    locale === "ar" ? "ar-TN" : locale === "en" ? "en-GB" : "fr-FR",
    { day: "2-digit", month: "short", year: "numeric" },
  )

  return (
    <div className="bg-card border-border rounded-2xl border">
      <div className="border-border border-b px-5 py-4">
        <h2 className="text-foreground text-sm font-semibold">
          {t("walletRequestsTitle")}
        </h2>
      </div>
      <ul className="divide-border divide-y">
        {requests.map((r) => {
          const methodKey =
            TOPUP_METHOD_LABEL_KEYS[r.method as TopupMethodKey] ?? null
          const statusKey =
            TOPUP_STATUS_LABEL_KEYS[
              r.status as keyof typeof TOPUP_STATUS_LABEL_KEYS
            ] ?? null
          return (
            <li
              key={r.id}
              className="flex flex-wrap items-start gap-3 px-5 py-3.5"
            >
              <div className="min-w-0 flex-1">
                <p className="text-foreground text-sm font-medium">
                  {methodKey ? t(methodKey) : r.method}
                </p>
                <p className="text-muted-foreground text-xs">
                  {dtFormat.format(new Date(r.createdAt))}
                  {r.customerReference && (
                    <>
                      {" · "}
                      <span dir="ltr">{r.customerReference}</span>
                    </>
                  )}
                </p>
                {r.status === "rejected" && r.rejectionReason && (
                  <p className="mt-1 text-xs text-rose-700 dark:text-rose-300">
                    {t("walletRequestRejectionReason", {
                      reason: r.rejectionReason,
                    })}
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="text-foreground text-sm font-semibold tabular-nums">
                  {Number(r.amount).toFixed(2)} DT
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[r.status] ?? STATUS_CLASS.failed}`}
                >
                  {statusKey ? t(statusKey) : r.status}
                </span>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
