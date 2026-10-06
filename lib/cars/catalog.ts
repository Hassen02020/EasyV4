/**
 * Catalogue public lieux/catégories — Module Location de voiture.
 *
 * Extrait de `app/(public)/[locale]/car/page.tsx` pour être réutilisable
 * par le widget rapide de la homepage (`components/booking-engine.tsx`),
 * qui a besoin du même catalogue réel pour peupler son propre
 * `<CarSearch locations={...} categories={...} />` — jamais une seconde
 * requête divergente, jamais une liste codée en dur (c'est exactement le
 * bug historique documenté dans car/page.tsx : `CarSearch` utilisait
 * autrefois des lieux/catégories codés en dur ne correspondant à aucune
 * ligne réelle).
 *
 * "use server" : interroge Drizzle/postgres, importé par un Server
 * Component (page.tsx).
 */
"use server"

import { and, eq } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import { carLocations, carCategories } from "@/lib/db/schema"
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"

export async function getActiveCarCatalog() {
  try {
    const agencyId = await getDefaultAgencyId()
    if (!agencyId) return { agencyId: null, locations: [], categories: [] }

    // Catalogue public (trafic anonyme, pas de session storefront).
    const [locations, categories] = await Promise.all([
      withSystemContext((db) =>
        db
          .select()
          .from(carLocations)
          .where(
            and(
              eq(carLocations.agencyId, agencyId),
              eq(carLocations.status, "active"),
            ),
          )
          .orderBy(carLocations.name),
      ),
      withSystemContext((db) =>
        db
          .select()
          .from(carCategories)
          .where(
            and(
              eq(carCategories.agencyId, agencyId),
              eq(carCategories.status, "active"),
            ),
          )
          .orderBy(carCategories.name),
      ),
    ])
    return { agencyId, locations, categories }
  } catch {
    return { agencyId: null, locations: [], categories: [] }
  }
}
