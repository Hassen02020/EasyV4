import "server-only"

/**
 * Lecture des produits autorisés pour une agence B2B/White Label
 * (Phase 13.1, gap #2 — "Agency → Authorized Products").
 *
 * `product_authorizations` (0023_commerce_completion.sql) ne stocke que
 * (agence, type, id) — pas les données du produit lui-même (3 tables
 * cibles différentes, pas de FK cross-table possible). Ce fichier fait le
 * jointure applicative : une requête par type de produit, RLS élargie
 * (même migration) fait le reste — l'agence courante ne verra que ce pour
 * quoi elle a une autorisation active (ou ses propres produits si elle est
 * elle-même de type 'ota').
 *
 * `import "server-only"` (PAS `"use server"`) délibérément : ces fonctions
 * prennent `agencyId` en paramètre brut — elles ne doivent JAMAIS devenir
 * des Server Actions invocables directement par le client (qui pourrait
 * alors passer l'agencyId d'une autre agence). Seul du code serveur déjà
 * authentifié (Server Component, autre Server Action ayant résolu
 * `agencyId` via `resolveSessionContext()`) doit les appeler — même
 * distinction que `lib/pro/server-context.ts::getMarginsForAgency`.
 */

import { eq, and, inArray } from "drizzle-orm"
import { withTenantContext } from "@/lib/db/tenant-context"
import {
  productAuthorizations,
  catalogPackages,
  omraPackages,
  catalogActivities,
} from "@/lib/db/schema"

export interface AuthorizedProductRow {
  authorizationId: string
  productType: "package" | "omra" | "activity"
  productId: string
  channel: string
  title: string
  status: string
}

/**
 * Liste les produits que `agencyId` est explicitement autorisée à revendre
 * (via `product_authorizations`), tous types confondus. N'inclut PAS les
 * produits que l'agence possède elle-même (réservé aux agences OTA — une
 * agence partenaire B2B n'en possède jamais, `assertProductManager` l'
 * interdit).
 */
export async function listAuthorizedProductsForAgency(
  agencyId: string,
  userId = "",
): Promise<AuthorizedProductRow[]> {
  if (!process.env.DATABASE_URL) return []

  return withTenantContext({ agencyId, userId, isSuperAdmin: false }, async (tx) => {
    const authRows = await tx
      .select()
      .from(productAuthorizations)
      .where(and(eq(productAuthorizations.agencyId, agencyId), eq(productAuthorizations.isActive, true)))

    if (authRows.length === 0) return []

    const packageIds = authRows.filter((a) => a.productType === "package").map((a) => a.productId)
    const omraIds = authRows.filter((a) => a.productType === "omra").map((a) => a.productId)
    const activityIds = authRows.filter((a) => a.productType === "activity").map((a) => a.productId)

    const [packages, omras, activities] = await Promise.all([
      packageIds.length
        ? tx.select().from(catalogPackages).where(inArray(catalogPackages.id, packageIds))
        : Promise.resolve([]),
      omraIds.length
        ? tx.select().from(omraPackages).where(inArray(omraPackages.id, omraIds))
        : Promise.resolve([]),
      activityIds.length
        ? tx.select().from(catalogActivities).where(inArray(catalogActivities.id, activityIds))
        : Promise.resolve([]),
    ])

    const rows: AuthorizedProductRow[] = []
    for (const auth of authRows) {
      if (auth.productType === "package") {
        const p = packages.find((x) => x.id === auth.productId)
        if (p) rows.push({ authorizationId: auth.id, productType: "package", productId: p.id, channel: auth.channel, title: p.title, status: p.status })
      } else if (auth.productType === "omra") {
        const p = omras.find((x) => x.id === auth.productId)
        if (p) rows.push({ authorizationId: auth.id, productType: "omra", productId: p.id, channel: auth.channel, title: p.name, status: p.status })
      } else {
        const p = activities.find((x) => x.id === auth.productId)
        if (p) rows.push({ authorizationId: auth.id, productType: "activity", productId: p.id, channel: auth.channel, title: p.title, status: p.status })
      }
    }
    return rows
  })
}
