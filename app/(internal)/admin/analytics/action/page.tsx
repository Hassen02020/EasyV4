/**
 * ACTION-ENGINE-01 — "Quoi faire ?"
 *
 * Recommandations structurées, explicables et exécutables dérivées des signaux
 * Signal Engine. Chaque ActionRow expose : priorité, canal, fenêtre d'urgence,
 * rationale (POURQUOI), script (QUOI DIRE) et campaignHints (pour Campaign Engine).
 *
 * Réutilise getActionEngine (lib/admin/action-engine-actions.ts).
 */

"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getActionEngine } from "@/lib/admin/action-engine-actions"
import type { ActionRow } from "@/lib/admin/action-engine-actions"

const PRIORITY_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
> = {
  urgent: { label: "Urgent", variant: "destructive" },
  haute: { label: "Haute", variant: "default" },
  normale: { label: "Normale", variant: "secondary" },
  faible: { label: "Faible", variant: "outline" },
}

const ACTION_TYPE_LABEL: Record<string, string> = {
  appel_direct: "Appel direct",
  whatsapp_personnalise: "WhatsApp",
  email_personnalise: "Email perso.",
  email_decouverte: "Email découverte",
  newsletter: "Newsletter",
}

const CHANNEL_LABEL: Record<string, string> = {
  phone: "📞 Téléphone",
  whatsapp: "💬 WhatsApp",
  email: "✉️ Email",
}

const WINDOW_OPTIONS: { label: string; value: 4 | 8 | 12 }[] = [
  { label: "4 semaines", value: 4 },
  { label: "8 semaines", value: 8 },
  { label: "12 semaines", value: 12 },
]

export default function ActionEnginePage() {
  const [actions, setActions] = useState<ActionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [windowWeeks, setWindowWeeks] = useState<4 | 8 | 12>(4)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setLoadError(null)
      const result = await getActionEngine(windowWeeks)
      if (cancelled) return
      if (result.ok) {
        setActions(result.actions)
      } else {
        setActions([])
        setLoadError(result.error)
      }
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [windowWeeks])

  const urgentCount = actions.filter((a) => a.priority === "urgent").length
  const hauteCount = actions.filter((a) => a.priority === "haute").length
  const appelCount = actions.filter((a) => a.actionType === "appel_direct").length
  const topAction = actions[0]

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Action Engine</h1>
            <p className="text-muted-foreground text-sm">
              Recommandations structurées, explicables et exécutables dérivées
              des signaux convergents. Top {actions.length} actions.
            </p>
          </div>
          <div className="flex gap-2">
            {WINDOW_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                variant={windowWeeks === opt.value ? "default" : "outline"}
                size="sm"
                onClick={() => setWindowWeeks(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {loadError && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive text-sm">{loadError}</p>
          </CardContent>
        </Card>
      )}

      {!loading && !loadError && actions.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground text-xs uppercase tracking-wide">
                Actions totales
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {actions.length}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground text-xs uppercase tracking-wide">
                Urgentes + Hautes
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-destructive">
                {urgentCount + hauteCount}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground text-xs uppercase tracking-wide">
                Appels directs
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                {appelCount}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {topAction && !loading && (
        <Card className="border-destructive/30">
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Action prioritaire
            </p>
            <p className="mt-1 text-lg font-semibold">{topAction.scriptLine}</p>
            <p className="text-muted-foreground text-sm">
              {topAction.rationale}
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Plan d&apos;action ({actions.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm">Chargement…</p>
          ) : actions.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Aucune action — les recommandations apparaîtront quand des signaux
              convergents seront détectés.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>Acteur VIP</TableHead>
                    <TableHead>Priorité</TableHead>
                    <TableHead>Canal</TableHead>
                    <TableHead>Fenêtre</TableHead>
                    <TableHead>Action & Rationale</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {actions.map((row, i) => {
                    const prio =
                      PRIORITY_CONFIG[row.priority] ?? {
                        label: row.priority,
                        variant: "secondary" as const,
                      }
                    const isExpanded = expanded === row.actionId
                    return (
                      <>
                        <TableRow
                          key={row.actionId}
                          className="cursor-pointer"
                          onClick={() =>
                            setExpanded(isExpanded ? null : row.actionId)
                          }
                        >
                          <TableCell className="text-muted-foreground tabular-nums text-sm">
                            {i + 1}
                          </TableCell>
                          <TableCell>
                            <p className="font-medium">
                              {row.firstName}
                              {row.lastName ? ` ${row.lastName}` : ""}
                              {row.leadCount > 1 && (
                                <Badge
                                  variant="outline"
                                  className="ml-2 text-xs"
                                >
                                  ×{row.leadCount}
                                </Badge>
                              )}
                            </p>
                            {row.contactId && (
                              <p className="text-muted-foreground font-mono text-xs">
                                contact·{row.contactId.slice(0, 8)}
                              </p>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={prio.variant}>{prio.label}</Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {CHANNEL_LABEL[row.channel] ?? row.channel}
                          </TableCell>
                          <TableCell className="tabular-nums text-sm">
                            {row.urgencyWindow}
                          </TableCell>
                          <TableCell className="max-w-xs">
                            <p className="text-sm font-medium">
                              {ACTION_TYPE_LABEL[row.actionType] ??
                                row.actionType}
                            </p>
                            <p className="text-muted-foreground line-clamp-1 text-xs">
                              {row.scriptLine}
                            </p>
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm">
                            {row.combinedScore}
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow key={`${row.actionId}-detail`}>
                            <TableCell />
                            <TableCell colSpan={6} className="pb-4">
                              <div className="bg-muted/40 rounded-md p-3 text-sm space-y-2">
                                <p>
                                  <span className="text-muted-foreground font-medium">
                                    Script :{" "}
                                  </span>
                                  {row.scriptLine}
                                </p>
                                <p>
                                  <span className="text-muted-foreground font-medium">
                                    Sujet :{" "}
                                  </span>
                                  {row.subject}
                                </p>
                                <p>
                                  <span className="text-muted-foreground font-medium">
                                    Rationale :{" "}
                                  </span>
                                  {row.rationale}
                                </p>
                                <p className="text-muted-foreground text-xs font-mono">
                                  campaignHints · urgencyHours{" "}
                                  {row.campaignHints.urgencyHours} · vipScore{" "}
                                  {row.campaignHints.vipScore} · trend{" "}
                                  {row.campaignHints.marketTrend} · growth{" "}
                                  {row.campaignHints.marketGrowthRate} ·
                                  signalStrength{" "}
                                  {row.campaignHints.signalStrength}
                                </p>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
