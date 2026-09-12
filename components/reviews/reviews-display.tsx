import { useTranslations, useLocale } from "next-intl"
import { StarRow } from "@/components/reviews/star-row"
import type { PublicReviewRow } from "@/lib/reviews/reviews-core"
import { getIntlLocale } from "@/lib/i18n-date"

export interface ReviewsDisplaySummary {
  average: number
  count: number
  reviews: PublicReviewRow[]
}

export function ReviewsDisplay({ summary }: { summary: ReviewsDisplaySummary }) {
  const t = useTranslations("Common")
  const locale = useLocale()
  return (
    <section className="border-border/60 space-y-4 border-t pt-6">
      <div className="flex items-center gap-3">
        <h2 className="text-foreground text-lg font-bold">{t("reviewsTitle")}</h2>
        {summary.count > 0 ? (
          <div className="flex items-center gap-2">
            <StarRow rating={summary.average} />
            <span className="text-foreground text-sm font-semibold">{summary.average.toFixed(1)}/5</span>
            <span className="text-muted-foreground text-sm">{t("reviewsCount", { count: summary.count })}</span>
          </div>
        ) : null}
      </div>

      {summary.count === 0 ? (
        <p className="text-muted-foreground text-sm">
          {t("noReviewsYet")}
        </p>
      ) : (
        <ul className="space-y-4">
          {summary.reviews.map((r) => (
            <li key={r.id} className="border-border/50 rounded-xl border p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-foreground text-sm font-semibold">{r.reviewerDisplayName}</span>
                <StarRow rating={r.rating} size="size-3.5" />
              </div>
              {r.comment ? <p className="text-muted-foreground mt-2 text-sm">{r.comment}</p> : null}
              <p className="text-muted-foreground mt-2 text-xs">
                {new Date(r.createdAt).toLocaleDateString(getIntlLocale(locale), { day: "numeric", month: "long", year: "numeric" })}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
