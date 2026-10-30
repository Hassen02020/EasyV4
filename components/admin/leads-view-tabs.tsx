"use client"

import { useState } from "react"
import { LayoutList, Columns } from "lucide-react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { LeadsTable, type LeadPatch } from "@/components/admin/leads-table"
import { LeadPipeline } from "@/components/admin/lead-pipeline"
import { LeadStatsBar } from "@/components/admin/lead-stats-bar"
import { Card, CardContent } from "@/components/ui/card"
import type { LeadRow } from "@/lib/crm/leads-core"
import type { LeadScoreRuleMap } from "@/lib/crm/lead-scoring-core"
import type { LeadRelanceSettingsValue } from "@/lib/crm/lead-relance-core"

/**
 * CRM-LEADS-SYNC-01 (écart G-23) — une seule liste de leads partagée par la
 * barre de statistiques, le tableau et le pipeline : un changement de statut
 * fait dans une vue est immédiatement reflété dans les deux autres.
 */
export function LeadsViewTabs({
  leads: initialLeads,
  scoreRules,
  relanceSettings,
}: {
  leads: LeadRow[]
  scoreRules: LeadScoreRuleMap
  relanceSettings: LeadRelanceSettingsValue
}) {
  const [tab, setTab] = useState<"table" | "pipeline">("table")
  const [leads, setLeads] = useState<LeadRow[]>(initialLeads)

  function patchLead(id: string, patch: LeadPatch) {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  if (leads.length === 0) {
    return (
      <Card>
        <CardContent className="text-muted-foreground py-10 text-center text-sm">
          Aucune demande de contact pour le moment.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <LeadStatsBar leads={leads} relanceSettings={relanceSettings} />
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as "table" | "pipeline")}
      >
        <TabsList className="mb-4">
          <TabsTrigger value="table" className="gap-1.5">
            <LayoutList className="h-4 w-4" />
            Tableau
          </TabsTrigger>
          <TabsTrigger value="pipeline" className="gap-1.5">
            <Columns className="h-4 w-4" />
            Pipeline
          </TabsTrigger>
        </TabsList>
        <TabsContent value="table" forceMount hidden={tab !== "table"}>
          <LeadsTable
            leads={leads}
            scoreRules={scoreRules}
            relanceSettings={relanceSettings}
            onLeadChange={patchLead}
          />
        </TabsContent>
        <TabsContent value="pipeline" forceMount hidden={tab !== "pipeline"}>
          <LeadPipeline
            leads={leads}
            scoreRules={scoreRules}
            relanceSettings={relanceSettings}
            onLeadChange={patchLead}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
