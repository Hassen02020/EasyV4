import type { WalletTransaction } from "@/lib/finance/customer-wallet"
import { getTranslations } from "next-intl/server"
import { ArrowDownLeft, ArrowUpRight } from "lucide-react"

interface Props {
  transactions: WalletTransaction[]
  locale: string
}

export async function WalletTransactionList({ transactions, locale }: Props) {
  const t = await getTranslations("Compte")

  const dtFormat = new Intl.DateTimeFormat(
    locale === "ar" ? "ar-TN" : locale === "en" ? "en-GB" : "fr-FR",
    { day: "2-digit", month: "short", year: "numeric" },
  )

  return (
    <div className="bg-card border-border rounded-2xl border">
      <div className="border-border border-b px-5 py-4">
        <h2 className="text-foreground text-sm font-semibold">
          {t("walletHistoryTitle")}
        </h2>
      </div>

      {transactions.length === 0 ? (
        <p className="text-muted-foreground px-5 py-8 text-center text-sm">
          {t("walletHistoryEmpty")}
        </p>
      ) : (
        <ul className="divide-border divide-y">
          {transactions.map((tx) => {
            const isCredit = tx.type === "credit" || tx.type === "adjustment"
            return (
              <li key={tx.id} className="flex items-center gap-3 px-5 py-3.5">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    isCredit
                      ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
                      : "bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400"
                  }`}
                >
                  {isCredit ? (
                    <ArrowDownLeft className="h-4 w-4" />
                  ) : (
                    <ArrowUpRight className="h-4 w-4" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-foreground truncate text-sm font-medium">
                    {tx.description}
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {dtFormat.format(tx.createdAt)}
                    {tx.category && (
                      <span className="text-muted-foreground/60 ms-2 capitalize">
                        · {tx.category}
                      </span>
                    )}
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  <p
                    className={`text-sm font-semibold tabular-nums ${
                      isCredit
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-foreground"
                    }`}
                  >
                    {isCredit ? "+" : "−"}
                    {tx.amount.toFixed(3)} DT
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-xs tabular-nums">
                    → {tx.balanceAfter.toFixed(3)} DT
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
