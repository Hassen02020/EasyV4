/**
 * Avis clients — section publique affichée sur une fiche produit
 * (omra/package/activity — Server Components). Lit directement les avis
 * approuvés via withSystemContext() (trafic anonyme, même pattern que le
 * reste des pages produit publiques), jamais un avis non modéré.
 *
 * `/hotels/[id]` est entièrement "use client" (fetch client-side) et ne
 * peut pas monter ce composant serveur directement — voir
 * ProductReviewsSectionClient (même rendu, via /api/reviews/product).
 */

import { withSystemContext } from "@/lib/db/tenant-context"
import { listApprovedReviewsForProductCore, type ReviewModule } from "@/lib/reviews/reviews-core"
import { ReviewsDisplay } from "@/components/reviews/reviews-display"

export async function ProductReviewsSection({
  agencyId,
  module,
  productRef,
}: {
  agencyId: string
  module: ReviewModule
  productRef: string
}) {
  const summary = await withSystemContext((db) =>
    listApprovedReviewsForProductCore(db, { agencyId, module, productRef }),
  )

  return <ReviewsDisplay summary={summary} />
}
