"use client"

import { useState } from "react"
import { LayoutList, Columns } from "lucide-react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { LeadsTable } from "@/components/admin/leads-table"
import { LeadPipeline } from "@/components/admin/lead-pipeline"
import { Card, CardContent } from "@/components/ui/card"
import type { LeadRow } from "@/lib/crm/leads-core"
import type { LeadScoreRuleMap } from "@/lib/crm/lead-scoring-core"
import type { LeadRelanceSettingsValue } from "@/lib/crm/lead-relance-core"

export function LeadsViewTabs({
  leads,
  scoreRules,
  relanceSettings,
}: {
  leads: LeadRow[]
  scoreRules: LeadScoreRuleMap
  relanceSettings: LeadRelanceSettingsValue
}) {
  const [tab, setTab] = useState<"table" | "pipeline">("table")

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
    <Tabs value={tab} onValueChange={(v) => setTab(v as "table" | "pipeline")}>
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
        />
      </TabsContent>
      <TabsContent value="pipeline" forceMount hidden={tab !== "pipeline"}>
        <LeadPipeline
          leads={leads}
          scoreRules={scoreRules}
          relanceSettings={relanceSettings}
        />
      </TabsContent>
    </Tabs>
  )
}
