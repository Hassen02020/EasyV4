/**
 * /admin/support — CRM / Leads : demandes de contact ("Être rappelé" /
 * "Demander un devis") déposées par des visiteurs.
 *
 * Fixe un lien de navigation mort : "Support & Clients" (components/admin-shell.tsx)
 * pointait déjà vers /admin/support, qui n'a jamais existé (404 pour
 * super_admin/manager/agent_resa, les 3 rôles qui voient ce lien).
 */

import { Metadata } from "next"
import { redirect } from "next/navigation"
import { Headphones } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LeadsTable } from "@/components/admin/leads-table"
import { LeadScoringSettings } from "@/components/admin/lead-scoring-settings"
import { LeadRelanceSettings } from "@/components/admin/lead-relance-settings"
import { InboxPanel } from "@/components/admin/inbox-panel"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { listLeads } from "@/lib/admin/leads-actions"
import { getLeadScoreRules } from "@/lib/admin/lead-scoring-actions"
import { getLeadRelanceSettings } from "@/lib/admin/lead-relance-actions"
import { defaultLeadScoreRuleMap } from "@/lib/crm/lead-scoring-core"
import { defaultLeadRelanceSettings } from "@/lib/crm/lead-relance-core"

export const metadata: Metadata = {
  title: "Support & Clients — Admin",
  description: "Demandes de contact déposées par les visiteurs.",
}

export const dynamic = "force-dynamic"

export default async function SupportPage() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?next=/admin/support")
  }

  const profile = await getCurrentAdminProfile(user.id)
  const allowedRoles = ["super_admin", "manager", "agent_resa"]
  if (!profile || !allowedRoles.includes(profile.role)) {
    redirect("/admin")
  }

  const [result, scoreRulesResult, relanceSettingsResult] = await Promise.all([
    listLeads(),
    getLeadScoreRules(),
    getLeadRelanceSettings(),
  ])
  const scoreRules = scoreRulesResult.ok ? scoreRulesResult.rules : defaultLeadScoreRuleMap()
  const relanceSettings = relanceSettingsResult.ok ? relanceSettingsResult.settings : defaultLeadRelanceSettings()
  const canConfigure = ["super_admin", "manager"].includes(profile.role)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Headphones className="h-6 w-6" />
          Support & Clients
        </h1>
        <p className="text-muted-foreground text-sm">
          Demandes de contact (&laquo;&nbsp;Être rappelé&nbsp;&raquo; / &laquo;&nbsp;Demander un devis&nbsp;&raquo;) déposées depuis le site.
        </p>
      </div>

      {canConfigure && <LeadScoringSettings initial={scoreRules} />}
      {canConfigure && <LeadRelanceSettings initial={relanceSettings} />}

      <InboxPanel />

      {!result.ok ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive text-base">Erreur</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">{result.error}</CardContent>
        </Card>
      ) : result.leads.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center text-sm">
            Aucune demande de contact pour le moment.
          </CardContent>
        </Card>
      ) : (
        <LeadsTable leads={result.leads} scoreRules={scoreRules} relanceSettings={relanceSettings} />
      )}
    </div>
  )
}
