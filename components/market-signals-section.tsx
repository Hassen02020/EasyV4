import { ExternalLink, TrendingUp } from "lucide-react"
import { getTranslations } from "next-intl/server"
import { getLatestMarketSignals } from "@/lib/market/queries"
import type { MarketSignal } from "@/lib/db/schema"

const CONFIDENCE_CLASSES: Record<MarketSignal["confidence"], string> = {
  HIGH: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  MEDIUM:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  LOW: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
}

export async function MarketSignalsSection() {
  const [signals, t] = await Promise.all([
    getLatestMarketSignals(),
    getTranslations("MarketSignals"),
  ])

  if (signals.length === 0) return null

  return (
    <section className="bg-slate-50 py-12 dark:bg-slate-900/50">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mb-8 flex items-center gap-3">
          <TrendingUp className="h-6 w-6 text-blue-600" />
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            {t("heading")}
          </h2>
        </div>

        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {signals.map((signal) => (
            <li
              key={signal.id}
              className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800"
            >
              <div className="flex items-start justify-between gap-2">
                <span
                  className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${CONFIDENCE_CLASSES[signal.confidence]}`}
                >
                  {t(`confidence.${signal.confidence}`)}
                </span>
                <time
                  dateTime={signal.publishedAt.toISOString()}
                  className="shrink-0 text-xs text-slate-500 dark:text-slate-400"
                >
                  {signal.publishedAt.toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </time>
              </div>

              <p className="flex-1 text-sm leading-snug font-medium text-slate-800 dark:text-slate-200">
                {signal.title}
              </p>

              {signal.summary && (
                <p className="line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                  {signal.summary}
                </p>
              )}

              <a
                href={signal.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-auto flex items-center gap-1 text-xs text-blue-600 hover:underline dark:text-blue-400"
              >
                <ExternalLink className="h-3 w-3" />
                {t("source")}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
