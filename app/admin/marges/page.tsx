/**
 * Page Admin — Configuration des marges (Yield Engine)
 * /admin/marges
 */

import { Suspense } from "react"
import { redirect } from "next/navigation"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { withTenantContext } from "@/lib/db/tenant-context"
import { yieldRules, agencies } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { YieldRulesManager } from "@/components/admin/yield-rules-manager"

export const dynamic = "force-dynamic"
export const metadata = { title: "Gestion des Marges | Admin" }

async function getData() {
  try {
    // Vue cross-agence (toutes les agences partenaires + toutes les règles
    // de marge) : is_super_admin=true requis.
    return await withTenantContext(
      { agencyId: null, userId: "", isSuperAdmin: true },
      async (db) => {
        const [agenciesList, rulesList] = await Promise.all([
          db
            .select({ id: agencies.id, name: agencies.name, type: agencies.agencyType })
            .from(agencies)
            .where(eq(agencies.agencyType, "partner"))
            .orderBy(agencies.name),
          db.select().from(yieldRules).orderBy(yieldRules.agencyId),
        ])
        return { agencies: agenciesList, rules: rulesList }
      },
    )
  } catch {
    return { agencies: [], rules: [] }
  }
}

export default async function MargesPage() {
  // Écriture (upsertYieldRule/toggleYieldRule) déjà restreinte à super_admin
  // (lib/yield/actions.ts::assertAdminForYield) — la lecture doit l'être
  // pareillement : cette vue expose les règles de marge de TOUTES les
  // agences partenaires, pas seulement celle de l'utilisateur courant.
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login?next=/admin/marges")

  const profile = await getCurrentAdminProfile(user.id)
  if (profile?.role !== "super_admin") {
    redirect("/admin")
  }

  const { agencies: agenciesList, rules } = await getData()

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Gestion des Marges (Yield Engine)</h1>
        <p className="text-sm text-muted-foreground">
          Configurez les règles de marge par module et par agence partenaire.
        </p>
      </div>

      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
        <YieldRulesManager agencies={agenciesList} initialRules={rules} />
      </Suspense>
    </div>
  )
}
