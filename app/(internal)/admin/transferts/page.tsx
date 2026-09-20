/**
 * Back-office Transferts — /admin/transferts
 *
 * Voir lib/admin/transfers-catalog-actions.ts pour le périmètre exact : le
 * flux client (recherche → devis → réservation → paiement → facture → SMS
 * chauffeur) existait déjà et fonctionne — seul manquait un moyen, pour un
 * admin/manager, de créer les zones/tarifs qu'il vend. Même pattern que
 * /admin/products (Phase 13) : garde `assertProductManager`, données
 * chargées côté serveur, mutations via Server Actions + `router.refresh()`.
 */

import { redirect } from "next/navigation"
import { Bus } from "lucide-react"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { listTransferZones, listTransferPricing } from "@/lib/admin/transfers-catalog-actions"
import { TransferCatalogManager } from "@/components/admin/transfer-catalog-manager"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Transferts — Catalogue | Admin",
}

const PRODUCT_MANAGER_ROLES = ["super_admin", "manager"]

export default async function AdminTransfertsPage() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login?next=/admin/transferts")

  const profile = await getCurrentAdminProfile(user.id)
  if (!profile || profile.agencyType !== "ota" || !PRODUCT_MANAGER_ROLES.includes(profile.role ?? "")) {
    redirect("/admin")
  }

  const [zones, pricing] = await Promise.all([listTransferZones(), listTransferPricing()])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-foreground flex items-center gap-2 text-2xl font-bold">
          <Bus className="h-6 w-6" />
          Transferts — Catalogue
        </h1>
        <p className="text-muted-foreground text-sm">
          Zones de départ/arrivée et tarifs — le flux client (recherche, devis, réservation) les utilise déjà.
        </p>
      </div>

      <TransferCatalogManager initialZones={zones} initialPricing={pricing} />
    </div>
  )
}
