/**
 * RADAR-VIP-01 — "Qui devient important ?"
 *
 * Vue population : top 50 leads classés par score VIP décroissant.
 * Réutilise getRadarVip (lib/admin/radar-vip-actions.ts).
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
import { getRadarVip } from "@/lib/admin/radar-vip-actions"
import type { VipRadarRow } from "@/lib/admin/radar-vip-actions"

const PRODUCT_LABEL: Record<string, string> = {
  hotel: "Hôtel",
  omra: "Omra",
  package: "Voyage organisé",
  activity: "Activité",
  general: "Général",
}

const CHANNEL_LABEL: Record<string, string> = {
  web: "Web",
  email: "E-mail",
  phone: "Téléphone",
  whatsapp: "WhatsApp",
  sms: "SMS",
  partner: "Partenaire",
  b2b: "B2B",
  "(direct)": "Direct",
}

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
> = {
  new: { label: "Nouveau", variant: "secondary" },
  contacted: { label: "Contacté", variant: "default" },
  qualified: { label: "Qualifié", variant: "default" },
  proposal_sent: { label: "Devis envoyé", variant: "default" },
  won: { label: "Gagné", variant: "default" },
  lost: { label: "Perdu", variant: "destructive" },
  no_answer: { label: "Sans réponse", variant: "outline" },
}

function scoreBar(value: number, max: number = 100) {
  const pct = Math.min(100, Math.round((value / max) * 100))
  return (
    <div className="flex items-center gap-2">
      <div className="bg-muted h-1.5 w-16 overflow-hidden rounded-full">
        <div
          className="bg-primary h-full rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="tabular-nums text-sm">{value}</span>
    </div>
  )
}

export default function RadarVipPage() {
  const [rows, setRows] = useState<VipRadarRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setLoadError(null)
      const result = await getRadarVip()
      if (cancelled) return
      if (result.ok) {
        setRows(result.rows)
      } else {
        setRows([])
        setLoadError(result.error)
      }
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const topLead = rows[0]
  const highScoreCount = rows.filter((r) => r.score.total >= 70).length

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Radar VIP</h1>
        <p className="text-muted-foreground text-sm">
          Top 50 leads classés par score VIP — recalculé à la demande sur les
          200 leads les plus récents. Aucune donnée persistée.
        </p>
      </div>

      {loadError && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive text-sm">{loadError}</p>
          </CardContent>
        </Card>
      )}

      {!loading && !loadError && rows.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground text-xs uppercase tracking-wide">
                Leads scorés
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {rows.length}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground text-xs uppercase tracking-wide">
                Score ≥ 70
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                {highScoreCount}
              </p>
            </CardContent>
          </Card>
          {topLead && (
            <Card>
              <CardContent className="pt-6">
                <p className="text-muted-foreground text-xs uppercase tracking-wide">
                  Score max
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {topLead.score.total}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {topLead && !loading && (
        <Card className="border-amber-500/30">
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Lead le plus prometteur
            </p>
            <p className="mt-1 text-lg font-semibold">
              {topLead.firstName}
              {topLead.lastName ? ` ${topLead.lastName}` : ""}
            </p>
            <p className="text-muted-foreground text-sm">
              {PRODUCT_LABEL[topLead.productType] ?? topLead.productType}
              {topLead.destination ? ` · ${topLead.destination}` : ""}
              {" · Score "}
              <span className="font-medium">{topLead.score.total}</span>
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Classement VIP ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm">Chargement…</p>
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Aucun lead scoré — les scores apparaîtront dès les premières
              demandes.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>Lead</TableHead>
                    <TableHead>Produit</TableHead>
                    <TableHead>Canal</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Score total</TableHead>
                    <TableHead className="text-right">Qualité</TableHead>
                    <TableHead className="text-right">Engagement</TableHead>
                    <TableHead className="text-right">Vente</TableHead>
                    <TableHead className="text-right">Récence</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, i) => {
                    const status =
                      STATUS_CONFIG[row.status] ?? {
                        label: row.status,
                        variant: "secondary" as const,
                      }
                    return (
                      <TableRow key={row.leadId}>
                        <TableCell className="text-muted-foreground tabular-nums text-sm">
                          {i + 1}
                        </TableCell>
                        <TableCell>
                          <p className="font-medium">
                            {row.firstName}
                            {row.lastName ? ` ${row.lastName}` : ""}
                          </p>
                          {row.destination && (
                            <p className="text-muted-foreground text-xs">
                              {row.destination}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {PRODUCT_LABEL[row.productType] ?? row.productType}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {row.channel
                            ? (CHANNEL_LABEL[row.channel] ?? row.channel)
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={status.variant}>{status.label}</Badge>
                        </TableCell>
                        <TableCell>
                          {scoreBar(row.score.total)}
                        </TableCell>
                        {(["lead_quality", "engagement", "commercial_value_sale", "recency"] as const).map(
                          (sig) => {
                            const item = row.score.breakdown.find(
                              (b) => b.signal === sig,
                            )
                            return (
                              <TableCell
                                key={sig}
                                className="text-right tabular-nums text-sm"
                              >
                                {item ? item.points : "—"}
                              </TableCell>
                            )
                          },
                        )}
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
