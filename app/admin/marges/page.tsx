/**
 * Page Admin — Configuration des marges de vente
 * /admin/marges
 *
 * Gère désormais `pricing_margins` (via lib/pro/margins-actions.ts), la
 * table RÉELLEMENT utilisée par `applyMargin()` dans le flux de réservation
 * (lib/booking/actions.ts, lib/booking/guest-actions.ts, lib/cars/pricing.ts,
 * lib/transfers/pricing.ts) — cette page gérait auparavant `yieldRules`
 * ("Yield Engine"), une table distincte sans aucun effet sur un prix réel
 * (voir lib/pro/margins-core.ts pour le détail des systèmes concurrents
 * trouvés à l'audit).
 */

import { Suspense } from "react"
import { redirect } from "next/navigation"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { withTenantContext } from "@/lib/db/tenant-context"
import { pricingMargins, agencies } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { PricingMarginsManager } from "@/components/admin/pricing-margins-manager"

export const dynamic = "force-dynamic"
export const metadata = { title: "Gestion des Marges | Admin" }

async function getData() {
  try {
    // Vue cross-agence (toutes les agences partenaires + toutes les
    // marges) : is_super_admin=true requis.
    return await withTenantContext(
      { agencyId: null, userId: "", isSuperAdmin: true },
      async (db) => {
        const [agenciesList, marginsList] = await Promise.all([
          db
            .select({ id: agencies.id, name: agencies.name, type: agencies.agencyType })
            .from(agencies)
            .where(eq(agencies.agencyType, "partner"))
            .orderBy(agencies.name),
          db.select().from(pricingMargins).orderBy(pricingMargins.agencyId),
        ])
        return { agencies: agenciesList, margins: marginsList }
      },
    )
  } catch {
    return { agencies: [], margins: [] }
  }
}

export default async function MargesPage() {
  // Écriture (upsertAgencyPricingMargin) déjà restreinte à super_admin —
  // la lecture doit l'être pareillement : cette vue expose les marges de
  // TOUTES les agences partenaires, pas seulement celle de l'utilisateur
  // courant.
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login?next=/admin/marges")

  const profile = await getCurrentAdminProfile(user.id)
  if (profile?.role !== "super_admin") {
    redirect("/admin")
  }

  const { agencies: agenciesList, margins } = await getData()

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Gestion des Marges</h1>
        <p className="text-sm text-muted-foreground">
          Configurez les marges de vente par module et par agence partenaire — appliquées en temps réel au
          prix affiché (lib/pro/pricing.ts::applyMargin).
        </p>
      </div>

      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
        <PricingMarginsManager agencies={agenciesList} initialMargins={margins} />
      </Suspense>
    </div>
  )
}
