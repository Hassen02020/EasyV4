/**
 * Catalogue Produits — Master Admin Product Catalog (Phase 13)
 *
 * Remplace l'ancienne page 100% mock (`MOCK_PRODUCTS`, compteurs
 * hardcodés `count: 245` etc., zéro lecture BDD) par une vraie vue
 * unifiée sur les 3 tables catalogue réelles :
 *   - `catalog_packages` (Voyages Organisés)
 *   - `omra_packages` (Omra)
 *   - `catalog_activities` (Attractions — catalogue seul, pas encore de
 *     moteur de réservation, voir lib/admin/activities-actions.ts)
 *
 * Volontairement PAS de table `products` unique : chaque type garde sa
 * table dédiée (déjà réelle, déjà utilisée par les moteurs de réservation
 * Phase 12) — cette page est une union en lecture, pas une fusion de
 * schéma. Hôtels Tunisie/Monde et Vols/Transferts/Car ne sont pas listés
 * ici : ils n'ont pas de catalogue "produit" au sens de cette page (offre
 * fournisseur en temps réel via myGo, pas un produit configuré par un
 * admin) — cohérent avec la Partie 10 de la mission ("ne pas reconstruire
 * Hôtel Tunisie").
 */

import { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Plus, Building2, Moon, Briefcase, Ticket, Package as PackageIcon, Share2, ShieldCheck } from "lucide-react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { withTenantContext } from "@/lib/db/tenant-context"
import { catalogPackages, catalogActivities, omraPackages } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { ProductRowActions } from "@/components/admin/product-row-actions"

export const metadata: Metadata = {
  title: "Catalogue Produits — Manager",
  description: "Gestion du catalogue produit Omra / Voyages Organisés / Attractions",
}

export const dynamic = "force-dynamic"

type ProductRow = {
  id: string
  name: string
  type: "package" | "omra" | "activity"
  location: string | null
  price: number | null
  status: string
  channels: string[]
}

const TYPE_META: Record<ProductRow["type"], { label: string; icon: typeof Building2; color: string; editPath?: (id: string) => string }> = {
  package: { label: "Voyages Organisés", icon: Briefcase, color: "bg-violet-500", editPath: (id) => `/admin/products/package/${id}` },
  omra: { label: "Omra", icon: Moon, color: "bg-emerald-500", editPath: (id) => `/admin/products/omra/${id}` },
  // Pas de page d'édition pour l'instant — Attractions n'a pas de moteur de
  // réservation, voir lib/admin/activities-actions.ts. Créer/publier/
  // dupliquer restent possibles, "Modifier" est masqué (ProductRowActions).
  activity: { label: "Attractions", icon: Ticket, color: "bg-amber-500" },
}

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  draft: { label: "Brouillon", className: "bg-gray-100 text-gray-700" },
  published: { label: "Publié", className: "bg-emerald-100 text-emerald-800" },
  suspended: { label: "Suspendu", className: "bg-amber-100 text-amber-800" },
  archived: { label: "Archivé", className: "bg-gray-200 text-gray-500" },
}

async function getProducts(agencyId: string): Promise<ProductRow[]> {
  return withTenantContext({ agencyId, userId: "", isSuperAdmin: false }, async (tx) => {
    const [packages, omra, activities] = await Promise.all([
      tx
        .select({ id: catalogPackages.id, title: catalogPackages.title, status: catalogPackages.status, channels: catalogPackages.channels })
        .from(catalogPackages)
        .where(eq(catalogPackages.agencyId, agencyId)),
      tx
        .select({ id: omraPackages.id, name: omraPackages.name, status: omraPackages.status, basePrice: omraPackages.basePrice, channels: omraPackages.channels })
        .from(omraPackages)
        .where(eq(omraPackages.agencyId, agencyId)),
      tx
        .select({ id: catalogActivities.id, title: catalogActivities.title, status: catalogActivities.status, location: catalogActivities.location, channels: catalogActivities.channels })
        .from(catalogActivities)
        .where(eq(catalogActivities.agencyId, agencyId)),
    ])

    const rows: ProductRow[] = [
      ...packages.map((p) => ({ id: p.id, name: p.title, type: "package" as const, location: null, price: null, status: p.status, channels: p.channels })),
      ...omra.map((p) => ({ id: p.id, name: p.name, type: "omra" as const, location: null, price: p.basePrice ? parseFloat(p.basePrice) : null, status: p.status, channels: p.channels })),
      ...activities.map((p) => ({ id: p.id, name: p.title, type: "activity" as const, location: p.location, price: null, status: p.status, channels: p.channels })),
    ]
    return rows
  })
}

export default async function ProductsPage() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?next=/admin/products")
  }

  const profile = await getCurrentAdminProfile(user.id)
  const allowedRoles = ["super_admin", "manager"]
  if (!profile || !allowedRoles.includes(profile.role) || profile.agencyType !== "ota") {
    redirect("/admin")
  }

  const products = process.env.DATABASE_URL ? await getProducts(profile.agencyId) : []

  const counts = {
    package: products.filter((p) => p.type === "package"),
    omra: products.filter((p) => p.type === "omra"),
    activity: products.filter((p) => p.type === "activity"),
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-foreground text-3xl font-bold tracking-tight">Catalogue Produits</h1>
          <p className="text-muted-foreground mt-1">
            Créez, publiez et gérez les produits Omra, Voyages Organisés et Attractions.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/admin/products/authorizations">
              <Share2 className="mr-2 h-4 w-4" />
              Autorisations B2B
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/admin/products/policies">
              <ShieldCheck className="mr-2 h-4 w-4" />
              Politiques d&apos;annulation
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/admin/products/new/omra">
              <Plus className="mr-2 h-4 w-4" />
              Omra
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/admin/products/new/package">
              <Plus className="mr-2 h-4 w-4" />
              Voyage
            </Link>
          </Button>
          <Button className="bg-sidebar" asChild>
            <Link href="/admin/products/new/activity">
              <Plus className="mr-2 h-4 w-4" />
              Attraction
            </Link>
          </Button>
        </div>
      </div>

      {!process.env.DATABASE_URL ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Base de données non configurée — impossible de charger le catalogue.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        {(Object.keys(TYPE_META) as ProductRow["type"][]).map((type) => {
          const meta = TYPE_META[type]
          const Icon = meta.icon
          const rows = counts[type]
          const published = rows.filter((r) => r.status === "published").length
          return (
            <Card key={type} className="overflow-hidden">
              <div className={`h-1 ${meta.color}`} />
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <Icon className="h-5 w-5 text-gray-600" />
                  <Badge variant="outline">
                    {published}/{rows.length} publiés
                  </Badge>
                </div>
                <CardTitle className="text-base">{meta.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{rows.length}</p>
                <p className="text-xs text-gray-500">produits</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Tous les produits</CardTitle>
        </CardHeader>
        <CardContent>
          {products.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <PackageIcon className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                Aucun produit dans le catalogue. Créez le premier produit Omra, Voyage ou
                Attraction avec les boutons ci-dessus.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="py-3 text-left font-medium text-gray-500">Produit</th>
                    <th className="py-3 text-left font-medium text-gray-500">Type</th>
                    <th className="py-3 text-right font-medium text-gray-500">Prix indicatif</th>
                    <th className="py-3 text-center font-medium text-gray-500">Canaux</th>
                    <th className="py-3 text-center font-medium text-gray-500">Statut</th>
                    <th className="py-3 text-right font-medium text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => {
                    const meta = TYPE_META[product.type]
                    const TypeIcon = meta.icon
                    const statusMeta = STATUS_LABEL[product.status] ?? { label: product.status, className: "bg-gray-100 text-gray-700" }
                    return (
                      <tr key={`${product.type}-${product.id}`} className="border-b hover:bg-gray-50">
                        <td className="py-3">
                          <div className="flex items-center gap-3">
                            <div className={`h-8 w-8 rounded-lg ${meta.color} flex items-center justify-center`}>
                              <TypeIcon className="h-4 w-4 text-white" />
                            </div>
                            <div>
                              <p className="font-medium">{product.name}</p>
                              {product.location ? (
                                <p className="text-xs text-gray-500">{product.location}</p>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="py-3">
                          <Badge variant="outline">{meta.label}</Badge>
                        </td>
                        <td className="py-3 text-right font-semibold">
                          {product.price != null ? `${product.price.toLocaleString("fr-FR")} DT` : "—"}
                        </td>
                        <td className="py-3 text-center text-xs text-gray-500">
                          {product.channels.join(", ")}
                        </td>
                        <td className="py-3 text-center">
                          <Badge className={statusMeta.className}>{statusMeta.label}</Badge>
                        </td>
                        <td className="py-3 text-right">
                          <ProductRowActions
                            id={product.id}
                            type={product.type}
                            name={product.name}
                            status={product.status}
                            editPath={meta.editPath?.(product.id)}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
