"use client"

import { useMemo } from "react"
import { AlertCircle, ArrowRight, Check, X, Users } from "lucide-react"
import type { LeadRow } from "@/lib/crm/leads-core"
import type { LeadRelanceSettingsValue } from "@/lib/crm/lead-relance-core"
import { isLeadStale } from "@/lib/crm/lead-relance-core"

function StatChip({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  accent?: "amber" | "blue" | "emerald" | "muted" | "red"
}) {
  const colors: Record<string, string> = {
    amber:
      "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
    blue: "border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
    emerald:
      "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
    muted: "border-border bg-muted/50 text-muted-foreground",
    red: "border-red-300 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-950/40 dark:text-red-300",
  }
  return (
    <div
      className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium ${colors[accent ?? "muted"]}`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="text-[11px] font-normal opacity-75">{label}</span>
      <span className="ml-auto font-semibold tabular-nums">{value}</span>
    </div>
  )
}

export function LeadStatsBar({
  leads,
  relanceSettings,
}: {
  leads: LeadRow[]
  relanceSettings: LeadRelanceSettingsValue
}) {
  const stats = useMemo(() => {
    const byStatus = { new: 0, contacted: 0, converted: 0, closed: 0 }
    let stale = 0
    for (const lead of leads) {
      byStatus[lead.status] = (byStatus[lead.status] ?? 0) + 1
      if (isLeadStale(lead, relanceSettings)) stale++
    }
    const active = byStatus.new + byStatus.contacted + byStatus.converted
    const convRate =
      active > 0 ? Math.round((byStatus.converted / active) * 100) : 0
    return { byStatus, stale, convRate, total: leads.length }
  }, [leads, relanceSettings])

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      <StatChip
        icon={<Users className="h-3.5 w-3.5" />}
        label="Total"
        value={stats.total}
        accent="muted"
      />
      <StatChip
        icon={
          <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
        }
        label="Nouveau"
        value={stats.byStatus.new}
        accent="amber"
      />
      <StatChip
        icon={<ArrowRight className="h-3.5 w-3.5" />}
        label="Contacté"
        value={stats.byStatus.contacted}
        accent="blue"
      />
      <StatChip
        icon={<Check className="h-3.5 w-3.5" />}
        label="Converti"
        value={stats.byStatus.converted}
        accent="emerald"
      />
      <StatChip
        icon={<X className="h-3.5 w-3.5" />}
        label="Clos"
        value={stats.byStatus.closed}
        accent="muted"
      />
      <StatChip
        icon={<AlertCircle className="h-3.5 w-3.5" />}
        label={stats.stale > 0 ? "À relancer" : "Tx conversion"}
        value={stats.stale > 0 ? stats.stale : `${stats.convRate} %`}
        accent={stats.stale > 0 ? "red" : "muted"}
      />
    </div>
  )
}
