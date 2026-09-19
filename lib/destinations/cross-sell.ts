/**
 * Cross-sell produit sur les fiches destination ville — Phase Premium 2,
 * chantier 5 (voir docs/audits/destination-cross-sell-audit.md).
 *
 * Ni `catalog_packages` ni `catalog_activities` n'ont de colonne
 * destination — les deux relations ci-dessous sont réelles et déjà en
 * production ailleurs, pas inventées pour ce chantier :
 *   - Packages : `ILIKE(title)` sur `PACKAGE_DESTINATION_SEARCH_TERMS`,
 *     exactement le mécanisme déjà utilisé par `/packages?destination=X`
 *     (chantier 3) — la carte partagée ici évite de dupliquer ce mapping.
 *   - Attractions : `catalog_activities.location` (champ texte déjà là)
 *     comparé au nom de la destination — même nature de correspondance que
 *     la recherche déjà en place sur `/attractions?q=`.
 *
 * Omra et Hôtels Monde/Vols sont hors périmètre (voir audit) — aucune
 * fonction ici ne les concerne.
 */

import { and, eq, gte, ilike, inArray, arrayContains, sql } from "drizzle-orm"
import { withPublicAgencyContext } from "@/lib/db/tenant-context"
import {
  catalogPackages,
  catalogPackageDepartures,
  catalogActivities,
  catalogActivitySessions,
} from "@/lib/db/schema"
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"
import { getCoverMediaForProducts } from "@/lib/media/query"
import { PACKAGE_DESTINATION_SEARCH_TERMS } from "@/lib/destinations/package-search-terms"
import { listReviewSummariesForProductsCore } from "@/lib/reviews/reviews-core"

export { PACKAGE_DESTINATION_SEARCH_TERMS }

export interface CrossSellPackage {
  id: string
  slug: string
  title: string
  coverUrl: string | null
  durationDays: number | null
  priceFromTnd: number | null
}

/** Voyages organisés publiés dont le titre mentionne la destination. */
export async function getCrossSellPackages(destinationSlug: string): Promise<CrossSellPackage[]> {
  const searchTerm = PACKAGE_DESTINATION_SEARCH_TERMS[destinationSlug]
  if (!searchTerm) return []

  try {
    const agencyId = await getDefaultAgencyId()
    if (!agencyId) return []

    return await withPublicAgencyContext(agencyId, async (db) => {
      const rows = await db
        .select()
        .from(catalogPackages)
        .where(
          and(
            eq(catalogPackages.status, "published"),
            eq(catalogPackages.agencyId, agencyId),
            arrayContains(catalogPackages.channels, ["b2c"]),
            ilike(catalogPackages.title, `%${searchTerm}%`),
          ),
        )
        .orderBy(catalogPackages.title)
      if (rows.length === 0) return []

      const priceRows = await db
        .select({
          packageId: catalogPackageDepartures.packageId,
          minPrice: sql<string>`MIN(${catalogPackageDepartures.adultPriceTnd})`,
        })
        .from(catalogPackageDepartures)
        .where(
          and(
            inArray(catalogPackageDepartures.packageId, rows.map((r) => r.id)),
            eq(catalogPackageDepartures.status, "open"),
            gte(catalogPackageDepartures.departureDate, sql`CURRENT_DATE`),
          ),
        )
        .groupBy(catalogPackageDepartures.packageId)
      const priceByPackage = new Map(priceRows.map((r) => [r.packageId, parseFloat(r.minPrice)]))

      const coverByPackage = await getCoverMediaForProducts(db, agencyId, "package", rows.map((p) => p.id))

      // Chantier 8 (Ranking/Recommandation) : classées par note réelle
      // décroissante (avis approuvés, lib/reviews/reviews-core.ts) — repli
      // sur l'ordre alphabétique déjà en place (ci-dessus) tant qu'aucun
      // avis n'existe, jamais une popularité inventée.
      const reviewByPackage = await listReviewSummariesForProductsCore(db, {
        agencyId,
        module: "package",
        productRefs: rows.map((p) => p.id),
      })

      const mapped = rows.map((pkg) => ({
        id: pkg.id,
        slug: pkg.slug,
        title: pkg.title,
        coverUrl: coverByPackage.get(pkg.id)?.cardUrl ?? pkg.coverImage,
        durationDays: pkg.durationDays,
        priceFromTnd: priceByPackage.get(pkg.id) ?? null,
      }))
      mapped.sort(
        (a, b) => (reviewByPackage[b.id]?.average ?? 0) - (reviewByPackage[a.id]?.average ?? 0),
      )
      return mapped
    })
  } catch {
    return []
  }
}

export interface CrossSellActivity {
  id: string
  slug: string
  title: string
  coverUrl: string | null
  durationMinutes: number | null
  priceFromTnd: number | null
}

/** Attractions publiées dont `location` correspond au nom de la destination. */
export async function getCrossSellActivities(destinationName: string): Promise<CrossSellActivity[]> {
  try {
    const agencyId = await getDefaultAgencyId()
    if (!agencyId) return []

    return await withPublicAgencyContext(agencyId, async (db) => {
      const rows = await db
        .select()
        .from(catalogActivities)
        .where(
          and(
            eq(catalogActivities.status, "published"),
            eq(catalogActivities.agencyId, agencyId),
            arrayContains(catalogActivities.channels, ["b2c"]),
            ilike(catalogActivities.location, destinationName),
          ),
        )
        .orderBy(catalogActivities.title)
      if (rows.length === 0) return []

      const priceRows = await db
        .select({
          activityId: catalogActivitySessions.activityId,
          minPrice: sql<string>`MIN(${catalogActivitySessions.adultPriceTnd})`,
        })
        .from(catalogActivitySessions)
        .where(
          and(
            inArray(catalogActivitySessions.activityId, rows.map((r) => r.id)),
            eq(catalogActivitySessions.status, "open"),
            gte(catalogActivitySessions.sessionDate, sql`CURRENT_DATE`),
          ),
        )
        .groupBy(catalogActivitySessions.activityId)
      const priceByActivity = new Map(priceRows.map((r) => [r.activityId, parseFloat(r.minPrice)]))

      const coverByActivity = await getCoverMediaForProducts(db, agencyId, "activity", rows.map((a) => a.id))

      // Chantier 8 (Ranking/Recommandation) — voir le commentaire équivalent
      // dans getCrossSellPackages ci-dessus.
      const reviewByActivity = await listReviewSummariesForProductsCore(db, {
        agencyId,
        module: "activity",
        productRefs: rows.map((a) => a.id),
      })

      const mapped = rows.map((act) => ({
        id: act.id,
        slug: act.slug,
        title: act.title,
        coverUrl: coverByActivity.get(act.id)?.cardUrl ?? act.coverImage,
        durationMinutes: act.durationMinutes,
        priceFromTnd: priceByActivity.get(act.id) ?? null,
      }))
      mapped.sort(
        (a, b) => (reviewByActivity[b.id]?.average ?? 0) - (reviewByActivity[a.id]?.average ?? 0),
      )
      return mapped
    })
  } catch {
    return []
  }
}
