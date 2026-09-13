/**
 * Autorisations de revente B2B / White Label — /admin/products/authorizations
 * (Phase 13.1, gap #2/#3 — "Agency → Authorized Products").
 *
 * Liste les produits publiés et permet d'autoriser une agence tierce
 * (partenaire B2B ou tenant White Label) à les voir/vendre — écrit dans
 * `product_authorizations`, qui élargit la RLS lecture des tables
 * catalogue (0023_commerce_completion.sql). Sans autorisation explicite,
 * une agence tierce ne voit toujours strictement que ses propres produits
 * (comportement RLS inchangé, voir le commentaire de tête de la migration).
 */

import { Metadata } from "next"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { withTenantContext } from "@/lib/db/tenant-context"
import { catalogPackages, catalogActivities, omraPackages } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { listAuthorizableAgencies } from "@/lib/admin/product-authorizations-actions"
import { listAuthorizationsForProduct } from "@/lib/admin/product-authorizations-actions"
import { ProductAuthorizationPanel } from "@/components/admin/product-authorization-panel"

export const metadata: Metadata = {
  title: "Autorisations B2B / White Label — Manager",
  description: "Autoriser des agences partenaires ou tenants White Label à revendre des produits.",
}

export const dynamic = "force-dynamic"

type ProductRow = { id: string; name: string; type: "package" | "omra" | "activity" }

async function getPublishedProducts(agencyId: string): Promise<ProductRow[]> {
  return withTenantContext({ agencyId, userId: "", isSuperAdmin: false }, async (tx) => {
    const [packages, omra, activities] = await Promise.all([
      tx
        .select({ id: catalogPackages.id, title: catalogPackages.title })
        .from(catalogPackages)
        .where(eq(catalogPackages.agencyId, agencyId)),
      tx
        .select({ id: omraPackages.id, name: omraPackages.name })
        .from(omraPackages)
        .where(eq(omraPackages.agencyId, agencyId)),
      tx
        .select({ id: catalogActivities.id, title: catalogActivities.title })
        .from(catalogActivities)
        .where(eq(catalogActivities.agencyId, agencyId)),
    ])
    return [
      ...packages.map((p) => ({ id: p.id, name: p.title, type: "package" as const })),
      ...omra.map((p) => ({ id: p.id, name: p.name, type: "omra" as const })),
      ...activities.map((p) => ({ id: p.id, name: p.title, type: "activity" as const })),
    ]
  })
}

const TYPE_LABEL: Record<ProductRow["type"], string> = {
  package: "Voyage Organisé",
  omra: "Omra",
  activity: "Attraction",
}

export default async function ProductAuthorizationsPage() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login?next=/admin/products/authorizations")

  const profile = await getCurrentAdminProfile(user.id)
  const allowedRoles = ["super_admin", "manager"]
  if (!profile || !allowedRoles.includes(profile.role) || profile.agencyType !== "ota") {
    redirect("/admin")
  }

  if (!process.env.DATABASE_URL) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Base de données non configurée.
        </CardContent>
      </Card>
    )
  }

  const [products, agenciesResult] = await Promise.all([
    getPublishedProducts(profile.agencyId),
    listAuthorizableAgencies(),
  ])
  const agencies = agenciesResult.ok ? agenciesResult.data : []

  const authorizationsByProduct = await Promise.all(
    products.map(async (p) => {
      const result = await listAuthorizationsForProduct(p.type, p.id)
      return { product: p, authorizations: result.ok ? result.data : [] }
    }),
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-foreground text-3xl font-bold tracking-tight">
          Autorisations B2B / White Label
        </h1>
        <p className="text-muted-foreground mt-1">
          Autorisez une agence partenaire ou un tenant White Label à voir et vendre un produit —
          sans autorisation, une agence tierce ne voit jamais un produit qui ne lui appartient pas.
        </p>
      </div>

      {agencies.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Aucune autre agence active à autoriser pour le moment.
          </CardContent>
        </Card>
      ) : null}

      {authorizationsByProduct.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Aucun produit dans le catalogue — créez d&apos;abord un produit depuis{" "}
            <span className="font-medium">Catalogue Produits</span>.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {authorizationsByProduct.map(({ product, authorizations }) => (
            <Card key={`${product.type}-${product.id}`}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  {product.name}
                  <Badge variant="outline">{TYPE_LABEL[product.type]}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ProductAuthorizationPanel
                  productType={product.type}
                  productId={product.id}
                  agencies={agencies}
                  authorizations={authorizations}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
