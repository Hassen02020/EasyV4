/**
 * Avis clients — variante batch de /api/reviews/product pour une page de
 * résultats entière (ex. SERP hôtels) : une seule requête pour N cartes au
 * lieu de N requêtes. Même garde d'agence que la route existante — jamais
 * prise du paramètre client, toujours résolue serveur.
 */

import { type NextRequest, NextResponse } from "next/server"
import { withSystemContext } from "@/lib/db/tenant-context"
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"
import { REVIEW_MODULES, listReviewSummariesForProductsCore, type ReviewModule } from "@/lib/reviews/reviews-core"

export async function GET(request: NextRequest) {
  const moduleParam = request.nextUrl.searchParams.get("module")
  const refsParam = request.nextUrl.searchParams.get("productRefs")

  if (!moduleParam || !(REVIEW_MODULES as readonly string[]).includes(moduleParam) || !refsParam) {
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 })
  }

  const productRefs = Array.from(new Set(refsParam.split(",").filter(Boolean))).slice(0, 100)

  const agencyId = await getDefaultAgencyId()
  if (!agencyId) {
    return NextResponse.json({ summaries: {} })
  }

  const summaries = await withSystemContext((db) =>
    listReviewSummariesForProductsCore(db, { agencyId, module: moduleParam as ReviewModule, productRefs }),
  )

  return NextResponse.json({ summaries })
}
