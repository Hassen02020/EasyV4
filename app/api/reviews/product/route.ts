/**
 * Avis clients — lecture publique pour une fiche produit (utilisée par les
 * pages client-rendered comme /hotels/[id], qui ne peuvent pas monter un
 * Server Component directement). L'agence n'est JAMAIS prise du paramètre
 * client `agencyId` — toujours résolue serveur (`getDefaultAgencyId()`,
 * white-label-aware), même garde que les autres routes `*-public`
 * existantes (ex. /api/hotels/details-public/[id]).
 */

import { type NextRequest, NextResponse } from "next/server"
import { withSystemContext } from "@/lib/db/tenant-context"
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"
import { REVIEW_MODULES, listApprovedReviewsForProductCore, type ReviewModule } from "@/lib/reviews/reviews-core"

export async function GET(request: NextRequest) {
  const moduleParam = request.nextUrl.searchParams.get("module")
  const productRef = request.nextUrl.searchParams.get("productRef")

  if (!moduleParam || !(REVIEW_MODULES as readonly string[]).includes(moduleParam) || !productRef) {
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 })
  }

  const agencyId = await getDefaultAgencyId()
  if (!agencyId) {
    return NextResponse.json({ average: 0, count: 0, reviews: [] })
  }

  const summary = await withSystemContext((db) =>
    listApprovedReviewsForProductCore(db, { agencyId, module: moduleParam as ReviewModule, productRef }),
  )

  return NextResponse.json(summary)
}
