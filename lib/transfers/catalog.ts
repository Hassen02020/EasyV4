/**
 * Catalogue public des zones de transfert — Module Transferts.
 *
 * Extrait de `app/(public)/[locale]/transferts/page.tsx` pour être
 * réutilisable par le widget rapide de la homepage
 * (`components/booking-engine.tsx`), qui a besoin du même catalogue réel
 * pour peupler son propre `<TransferSearch zones={...} />` — jamais une
 * seconde requête divergente, jamais une liste codée en dur.
 *
 * "use server" : interroge Drizzle/postgres, importé par un Server
 * Component (page.tsx).
 */
"use server"

import { and, eq } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import { catalogTransferZones } from "@/lib/db/schema"
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"

export async function getActiveTransferZones() {
  try {
    // Catalogue public (trafic anonyme, pas de session storefront) — scopé à
    // l'agence OTA directe, même modèle que Packages/Attractions/Car.
    const agencyId = await getDefaultAgencyId()
    if (!agencyId) return []
    return await withSystemContext((db) =>
      db
        .select()
        .from(catalogTransferZones)
        .where(
          and(
            eq(catalogTransferZones.agencyId, agencyId),
            eq(catalogTransferZones.status, "active"),
          ),
        )
        .orderBy(catalogTransferZones.name),
    )
  } catch {
    return []
  }
}
