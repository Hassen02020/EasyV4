/**
 * LEARNING-01 — "Est-ce que ça a marché ?"
 *
 * Feedback loop : mesure la conversion des leads VIP sur la fenêtre.
 * Segments par bucket VIP (VIP++, VIP+, Pipeline, Faible).
 * Top convertis + délai moyen de conversion.
 *
 * Réutilise getLearning (lib/admin/learning-actions.ts).
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
import { getLearning } from "@/lib/admin/learning-actions"
import type { LearningStats } from "@/lib/admin/learning-actions"

const WINDOW_OPTIONS: { label: string; value: 4 | 8 | 12 }[] = [
  { label: "4 semaines", value: 4 },
  { label: "8 semaines", value: 8 },
  { label: "12 semaines", value: 12 },
]

const PRODUCT_LABEL: Record<string, string> = {
  hotel: "Hôtel",
  omra: "Omra",
  package: "Voyage organisé",
  activity: "Activité",
  general: "Général",
}

const BUCKET_VARIANT: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  vip_pp: "destructive",
  vip_p: "default",
  pipeline: "secondary",
  faible: "outline",
}

function RateBar({ rate }: { rate: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="bg-muted h-2 w-24 rounded-full overflow-hidden">
        <div
          className="bg-primary h-2 rounded-full transition-all"
          style={{ width: `${rate}%` }}
        />
      </div>
      <span className="tabular-nums text-sm">{rate}%</span>
    </div>
  )
}

export default function LearningPage() {
  const [stats, setStats] = useState<LearningStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [windowWeeks, setWindowWeeks] = useState<4 | 8 | 12>(4)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setLoadError(null)
      const result = await getLearning(windowWeeks)
      if (cancelled) return
      if (result.ok) {
        setStats(result.stats)
      } else {
        setStats(null)
        setLoadError(result.error)
      }
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [windowWeeks])

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Apprentissage</h1>
            <p className="text-muted-foreground text-sm">
              Feedback loop — mesure la conversion des leads VIP. Est-ce que les
              actions ont porté leurs fruits ?
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

      {!loading && stats && (
        <>
          {/* KPI tiles */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-muted-foreground text-xs uppercase tracking-wide">
                  Leads analysés
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {stats.totalLeads}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-muted-foreground text-xs uppercase tracking-wide">
                  Convertis
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-primary">
                  {stats.convertedLeads}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-muted-foreground text-xs uppercase tracking-wide">
                  Taux global
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {stats.overallRate}%
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-muted-foreground text-xs uppercase tracking-wide">
                  Délai moyen
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {stats.avgDaysToConvert !== null
                    ? `${stats.avgDaysToConvert}j`
                    : "—"}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Buckets VIP */}
          <Card>
            <CardHeader>
              <CardTitle>Conversion par segment VIP</CardTitle>
            </CardHeader>
            <CardContent>
              {stats.totalLeads === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Aucun lead sur cette période.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Segment</TableHead>
                        <TableHead>Score min</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Convertis</TableHead>
                        <TableHead>Taux</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stats.byBucket.map((b) => (
                        <TableRow key={b.bucket}>
                          <TableCell>
                            <Badge
                              variant={
                                BUCKET_VARIANT[b.bucket] ?? "secondary"
                              }
                            >
                              {b.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground tabular-nums text-sm">
                            ≥ {b.minScore}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm">
                            {b.total}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm">
                            {b.converted}
                          </TableCell>
                          <TableCell>
                            <RateBar rate={b.rate} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Destinations */}
            {stats.byDestination.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Destinations</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Destination</TableHead>
                          <TableHead className="text-right">Leads</TableHead>
                          <TableHead>Taux</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {stats.byDestination.map((d) => (
                          <TableRow key={d.dimension}>
                            <TableCell className="font-medium">
                              {d.dimension}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-sm">
                              {d.converted}/{d.total}
                            </TableCell>
                            <TableCell>
                              <RateBar rate={d.rate} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Produits */}
            {stats.byProduct.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Produits</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Produit</TableHead>
                          <TableHead className="text-right">Leads</TableHead>
                          <TableHead>Taux</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {stats.byProduct.map((p) => (
                          <TableRow key={p.dimension}>
                            <TableCell className="font-medium">
                              {PRODUCT_LABEL[p.dimension] ?? p.dimension}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-sm">
                              {p.converted}/{p.total}
                            </TableCell>
                            <TableCell>
                              <RateBar rate={p.rate} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Top convertis */}
          {stats.topConverted.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>
                  Top convertis ({stats.topConverted.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Lead</TableHead>
                        <TableHead>Produit</TableHead>
                        <TableHead>Destination</TableHead>
                        <TableHead className="text-right">Score VIP</TableHead>
                        <TableHead className="text-right">Délai</TableHead>
                        <TableHead>Converti le</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stats.topConverted.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium">
                            {c.firstName}
                            {c.lastName ? ` ${c.lastName}` : ""}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {PRODUCT_LABEL[c.productType] ?? c.productType}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {c.destination ?? "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm">
                            {c.vipScore}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm">
                            {c.daysToConvert}j
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {c.convertedAt.toLocaleDateString("fr-FR")}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {stats.totalLeads === 0 && (
            <Card>
              <CardContent className="pt-6">
                <p className="text-muted-foreground text-sm">
                  Aucun lead créé sur cette période — les statistiques
                  apparaîtront au fur et à mesure des nouvelles demandes.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {loading && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-sm">Chargement…</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
