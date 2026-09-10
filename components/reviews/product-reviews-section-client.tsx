"use client"

/**
 * Variante client de ProductReviewsSection — pour /hotels/[id], seule page
 * produit entièrement "use client" (fetch hôtel côté client), qui ne peut
 * pas monter un Server Component directement. Même rendu (ReviewsDisplay),
 * données via GET /api/reviews/product.
 */

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { ReviewsDisplay, type ReviewsDisplaySummary } from "@/components/reviews/reviews-display"

export function ProductReviewsSectionClient({
  module,
  productRef,
}: {
  module: "hotel" | "omra" | "package" | "activity"
  productRef: string
}) {
  const [summary, setSummary] = useState<ReviewsDisplaySummary | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/reviews/product?module=${module}&productRef=${encodeURIComponent(productRef)}`)
      .then((res) => (res.ok ? res.json() : { average: 0, count: 0, reviews: [] }))
      .then((data) => {
        if (!cancelled) setSummary(data)
      })
      .catch(() => {
        if (!cancelled) setSummary({ average: 0, count: 0, reviews: [] })
      })
    return () => {
      cancelled = true
    }
  }, [module, productRef])

  if (!summary) {
    return (
      <div className="border-border/60 flex items-center justify-center border-t py-6">
        <Loader2 className="text-muted-foreground size-5 animate-spin" />
      </div>
    )
  }

  return <ReviewsDisplay summary={summary} />
}
