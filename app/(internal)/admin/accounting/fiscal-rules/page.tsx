/**
 * Page Super Admin — Moteur de règles fiscales.
 *
 * Lecture : accounting.view (manager, agent_compta, super_admin)
 * Écriture : super_admin uniquement (vérifié côté serveur dans les actions)
 */

import { Metadata } from "next"
import { redirect } from "next/navigation"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { canAccessSection } from "@/lib/auth/rbac"
import type { AdminShellRole } from "@/components/admin-shell"
import { listFiscalRules } from "@/lib/finance/fiscal-rules-actions"
import { FiscalRulesManager } from "@/components/admin/fiscal-rules-manager"

export const metadata: Metadata = {
  title: "Règles fiscales — Comptabilité",
  description: "Moteur de taux de TVA par pays et module",
}

export const dynamic = "force-dynamic"

export default async function FiscalRulesPage() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?next=/admin/accounting/fiscal-rules")
  }

  const profile = await getCurrentAdminProfile(user.id)
  const role = (profile?.role as AdminShellRole) || "manager"

  if (!canAccessSection(role, "accounting")) {
    redirect(
      `/error/403?section=accounting&from=/admin/accounting/fiscal-rules`,
    )
  }

  const rulesResult = await listFiscalRules()
  const rules = rulesResult.ok ? rulesResult.rules : []

  const isSuperAdmin = role === "super_admin"

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Règles fiscales</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Taux de TVA applicables par pays et par module métier. Résolution :
          pays+module exact → pays+* → *+module → *+* (premier match actif à la
          date de réservation).
        </p>
      </div>
      <FiscalRulesManager initialRules={rules} isSuperAdmin={isSuperAdmin} />
    </div>
  )
}
