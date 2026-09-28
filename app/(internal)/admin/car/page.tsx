/**
 * Back-office Voitures — /admin/car
 *
 * Voir lib/admin/car-catalog-actions.ts pour le périmètre exact : même
 * chantier que /admin/transferts — le flux client (recherche → devis →
 * réservation, lib/cars/{actions,pricing}.ts) existait déjà et fonctionne,
 * seul manquait un moyen de créer les lieux/catégories/tarifs qu'un admin
 * vend. Même pattern que /admin/products (Phase 13) et /admin/transferts.
 */

import { redirect } from "next/navigation"
import { Car } from "lucide-react"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { listCarLocations, listCarCategories, listCarPricingRates } from "@/lib/admin/car-catalog-actions"
import { CarCatalogManager } from "@/components/admin/car-catalog-manager"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Voitures — Catalogue | Admin",
}

const PRODUCT_MANAGER_ROLES = ["super_admin", "manager"]

export default async function AdminCarPage() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login?next=/admin/car")

  const profile = await getCurrentAdminProfile(user.id)
  if (!profile || profile.agencyType !== "ota" || !PRODUCT_MANAGER_ROLES.includes(profile.role ?? "")) {
    redirect("/admin")
  }

  const [locations, categories, rates] = await Promise.all([
    listCarLocations(),
    listCarCategories(),
    listCarPricingRates(),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-foreground flex items-center gap-2 text-2xl font-bold">
          <Car className="h-6 w-6" />
          Voitures — Catalogue
        </h1>
        <p className="text-muted-foreground text-sm">
          Lieux de prise en charge, catégories de véhicules et tarifs — le flux client les utilise déjà.
        </p>
      </div>

      <CarCatalogManager initialLocations={locations} initialCategories={categories} initialRates={rates} />
    </div>
  )
}
