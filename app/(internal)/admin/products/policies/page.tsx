/**
 * Master Admin — Policy Engine (Omra/Package/Activity) — /admin/products/policies
 *
 * Même garde/pattern que /admin/products/authorizations : Server Component
 * qui charge le catalogue (pour le sélecteur de produit cible) + l'historique
 * complet des politiques de l'agence, puis délègue l'interactivité à un
 * composant client (`CancellationPolicyManager`).
 */

import { Metadata } from "next"
import { redirect } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { withTenantContext } from "@/lib/db/tenant-context"
import { catalogPackages, catalogActivities, omraPackages } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { listCancellationPolicies } from "@/lib/admin/cancellation-policy-actions"
import { CancellationPolicyManager } from "@/components/admin/cancellation-policy-manager"

export const metadata: Metadata = {
  title: "Politiques d'annulation — Manager",
  description: "Policy Engine Omra / Voyages Organisés / Attractions — annulation, remboursement, crédit wallet.",
}

export const dynamic = "force-dynamic"

type ProductRow = { id: string; name: string; type: "package" | "omra" | "activity" }

async function getPublishedProducts(agencyId: string): Promise<ProductRow[]> {
  return withTenantContext({ agencyId, userId: "", isSuperAdmin: false }, async (tx) => {
    const [packages, omra, activities] = await Promise.all([
      tx.select({ id: catalogPackages.id, title: catalogPackages.title }).from(catalogPackages).where(eq(catalogPackages.agencyId, agencyId)),
      tx.select({ id: omraPackages.id, name: omraPackages.name }).from(omraPackages).where(eq(omraPackages.agencyId, agencyId)),
      tx.select({ id: catalogActivities.id, title: catalogActivities.title }).from(catalogActivities).where(eq(catalogActivities.agencyId, agencyId)),
    ])
    return [
      ...packages.map((p) => ({ id: p.id, name: p.title, type: "package" as const })),
      ...omra.map((p) => ({ id: p.id, name: p.name, type: "omra" as const })),
      ...activities.map((p) => ({ id: p.id, name: p.title, type: "activity" as const })),
    ]
  })
}

export default async function CancellationPoliciesPage() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login?next=/admin/products/policies")

  const profile = await getCurrentAdminProfile(user.id)
  if (!profile?.agencyId || !["super_admin", "manager"].includes(profile.role ?? "")) {
    redirect("/admin")
  }

  if (!process.env.DATABASE_URL) {
    return (
      <div className="space-y-6">
        <h1 className="text-foreground text-3xl font-bold tracking-tight">Politiques d&apos;annulation</h1>
        <Card>
          <CardContent className="text-muted-foreground p-6 text-sm">
            Base de données non configurée.
          </CardContent>
        </Card>
      </div>
    )
  }

  const [products, policiesResult] = await Promise.all([
    getPublishedProducts(profile.agencyId),
    listCancellationPolicies(),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-foreground text-3xl font-bold tracking-tight">Politiques d&apos;annulation</h1>
        <p className="text-muted-foreground mt-1">
          Omra / Voyages Organisés / Attractions uniquement — l&apos;hôtel reste régi par la
          politique réelle du fournisseur myGo, jamais remplacée ici.
        </p>
      </div>

      {!policiesResult.ok ? (
        <Card>
          <CardContent className="text-destructive p-6 text-sm">{policiesResult.error}</CardContent>
        </Card>
      ) : (
        <CancellationPolicyManager products={products} initialPolicies={policiesResult.data} />
      )}
    </div>
  )
}
