/**
 * SIGNAL-ENGINE-01 — "Significatif ?"
 *
 * Convergence Radar Métier × Radar VIP :
 * un acteur VIP dans un marché en mouvement = signal actionnable.
 * Réutilise getSignalEngine (lib/admin/signal-engine-actions.ts).
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
import { getSignalEngine } from "@/lib/admin/signal-engine-actions"
import type { SignalRow } from "@/lib/admin/signal-engine-actions"

const PRODUCT_LABEL: Record<string, string> = {
  hotel: "Hôtel",
  omra: "Omra",
  package: "Voyage organisé",
  activity: "Activité",
  general: "Général",
}

const TREND_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
> = {
  forte_hausse: { label: "Forte hausse", variant: "default" },
  hausse: { label: "En hausse", variant: "secondary" },
  nouveau: { label: "Nouveau", variant: "outline" },
}

const SIGNAL_TYPE_LABEL: Record<string, string> = {
  vip_x_destination: "VIP × Destination",
  vip_x_product: "VIP × Produit",
}

const WINDOW_OPTIONS: { label: string; value: 4 | 8 | 12 }[] = [
  { label: "4 semaines", value: 4 },
  { label: "8 semaines", value: 8 },
  { label: "12 semaines", value: 12 },
]

function scoreBar(value: number, max: number = 200) {
  const pct = Math.min(100, Math.round((value / max) * 100))
  return (
    <div className="flex items-center gap-2">
      <div className="bg-muted h-1.5 w-16 overflow-hidden rounded-full">
        <div
          className="h-full rounded-full bg-amber-500 transition-all dark:bg-amber-400"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="tabular-nums text-sm">{value}</span>
    </div>
  )
}

export default function SignalEnginePage() {
  const [signals, setSignals] = useState<SignalRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [windowWeeks, setWindowWeeks] = useState<4 | 8 | 12>(4)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setLoadError(null)
      const result = await getSignalEngine(windowWeeks)
      if (cancelled) return
      if (result.ok) {
        setSignals(result.signals)
      } else {
        setSignals([])
        setLoadError(result.error)
      }
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [windowWeeks])

  const topSignal = signals[0]
  const vipXDestCount = signals.filter((s) => s.signalType === "vip_x_destination").length
  const vipXProdCount = signals.filter((s) => s.signalType === "vip_x_product").length

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Signal Engine</h1>
            <p className="text-muted-foreground text-sm">
              Convergence Radar Métier × Radar VIP — acteurs VIP dans un
              marché en mouvement. Top {signals.length} signaux actionnables.
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

      {!loading && !loadError && signals.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground text-xs uppercase tracking-wide">
                Signaux convergents
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {signals.length}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground text-xs uppercase tracking-wide">
                VIP × Destination
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                {vipXDestCount}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground text-xs uppercase tracking-wide">
                VIP × Produit
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {vipXProdCount}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {topSignal && !loading && (
        <Card className="border-amber-500/30">
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Signal le plus fort
            </p>
            <p className="mt-1 text-lg font-semibold">{topSignal.insight}</p>
            <p className="text-muted-foreground text-sm">
              Score combiné{" "}
              <span className="font-medium">{topSignal.combinedScore}</span>
              {" · "}VIP{" "}
              <span className="font-medium">{topSignal.vipScore}</span>
              {" + "}Signal{" "}
              <span className="font-medium">{topSignal.signalStrength}</span>
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Signaux convergents ({signals.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm">Chargement…</p>
          ) : signals.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Aucun signal convergent — les signaux apparaîtront quand des
              acteurs VIP seront dans des marchés en mouvement.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>Acteur VIP</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Dimension</TableHead>
                    <TableHead>Tendance</TableHead>
                    <TableHead>Croissance</TableHead>
                    <TableHead>Score combiné</TableHead>
                    <TableHead className="text-right">VIP</TableHead>
                    <TableHead className="text-right">Signal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {signals.map((row, i) => {
                    const trend =
                      TREND_CONFIG[row.trend] ?? {
                        label: row.trend,
                        variant: "secondary" as const,
                      }
                    const dimLabel =
                      row.dimensionType === "productType"
                        ? (PRODUCT_LABEL[row.dimension] ?? row.dimension)
                        : row.dimension
                    return (
                      <TableRow key={row.signalId}>
                        <TableCell className="text-muted-foreground tabular-nums text-sm">
                          {i + 1}
                        </TableCell>
                        <TableCell>
                          <p className="font-medium">
                            {row.firstName}
                            {row.lastName ? ` ${row.lastName}` : ""}
                            {row.leadCount > 1 && (
                              <Badge variant="outline" className="ml-2 text-xs">
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
                        <TableCell className="text-muted-foreground text-sm">
                          {SIGNAL_TYPE_LABEL[row.signalType] ?? row.signalType}
                        </TableCell>
                        <TableCell className="font-medium text-sm">
                          {dimLabel}
                        </TableCell>
                        <TableCell>
                          <Badge variant={trend.variant}>{trend.label}</Badge>
                        </TableCell>
                        <TableCell className="tabular-nums text-sm">
                          {row.growthRate}
                        </TableCell>
                        <TableCell>
                          {scoreBar(row.combinedScore, 200)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {row.vipScore}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {row.signalStrength}
                        </TableCell>
                      </TableRow>
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
