/**
 * Page Admin — Configuration des marges (Yield Engine)
 * /admin/marges
 */

import { Suspense } from "react"
import { withTenantContext } from "@/lib/db/tenant-context"
import { yieldRules, agencies } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { YieldRulesManager } from "@/components/admin/yield-rules-manager"

export const dynamic = "force-dynamic"
export const metadata = { title: "Gestion des Marges | Admin" }

async function getData() {
  try {
    // Vue cross-agence (toutes les agences partenaires + toutes les règles
    // de marge) : is_super_admin=true requis. Aucune session à résoudre ici
    // (userId placeholder) — cette page n'est accessible qu'après le gate
    // OTA-staff du layout /admin (app/admin/layout.tsx), et aucune policy
    // sur agencies/yield_rules ne dépend de app.current_user_id.
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
