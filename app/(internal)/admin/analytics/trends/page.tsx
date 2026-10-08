/**
 * TIME-SERIES-01 — répond aux piliers "FRÉQUENCE" et "CROISSANCE" :
 * "Qu'est-ce qui change ?" — tendances période-sur-période par module
 * de réservation, canal lead et type de produit.
 *
 * Trois vues tabulées : Modules (CA/marge), Canaux (leads), Produits (leads).
 * Sélecteur de fenêtre : 4 semaines / 8 semaines / 12 semaines.
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
import { getTimeSeries } from "@/lib/admin/time-series-actions"
import type { TimeSeriesRow } from "@/lib/admin/time-series-actions"

const MODULE_LABEL: Record<string, string> = {
  hotel: "Hôtel",
  omra: "Omra",
  package: "Voyage organisé",
  activity: "Activité",
  transfer: "Transfert",
  flight: "Vol",
  car: "Voiture",
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

const PRODUCT_LABEL: Record<string, string> = {
  hotel: "Hôtel",
  omra: "Omra",
  package: "Voyage organisé",
  activity: "Activité",
  general: "Général",
}

function growthBadge(rate: string) {
  if (rate === "N/A" || rate === "+∞") return <Badge variant="outline">{rate}</Badge>
  const n = parseFloat(rate)
  if (n > 0) return <Badge variant="default">{rate}</Badge>
  if (n < 0) return <Badge variant="destructive">{rate}</Badge>
  return <Badge variant="secondary">{rate}</Badge>
}

function fmtTnd(val: string) {
  const n = parseFloat(val)
  if (!Number.isFinite(n) || n === 0) return "—"
  return (
    new Intl.NumberFormat("fr-TN", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(n) + " TND"
  )
}

type Window = 4 | 8 | 12

export default function TrendsPage() {
  const [windowWeeks, setWindowWeeks] = useState<Window>(4)
  const [rows, setRows] = useState<TimeSeriesRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setLoadError(null)
      const result = await getTimeSeries(windowWeeks)
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
  }, [windowWeeks])

  const moduleRows = rows.filter((r) => r.dimensionType === "module")
  const channelRows = rows.filter((r) => r.dimensionType === "channel")
  const productRows = rows.filter((r) => r.dimensionType === "productType")

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Tendances</h1>
          <p className="text-muted-foreground text-sm">
            Comparaison période courante vs période précédente de même durée.
            CA et marge lus depuis{" "}
            <code className="text-xs">reservation_financials</code>.
          </p>
        </div>
        <div className="flex gap-2">
          {([4, 8, 12] as Window[]).map((w) => (
            <Button
              key={w}
              variant={windowWeeks === w ? "default" : "outline"}
              size="sm"
              onClick={() => setWindowWeeks(w)}
            >
              {w} sem.
            </Button>
          ))}
        </div>
      </div>

      {loadError && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive text-sm">{loadError}</p>
          </CardContent>
        </Card>
      )}

      {/* Modules — CA / Marge */}
      <Card>
        <CardHeader>
          <CardTitle>Modules — CA et marge ({moduleRows.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm">Chargement…</p>
          ) : moduleRows.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Aucune réservation sur la période.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Module</TableHead>
                    <TableHead className="text-right">CA courant</TableHead>
                    <TableHead className="text-right">CA précédent</TableHead>
                    <TableHead className="text-right">Croiss. CA</TableHead>
                    <TableHead className="text-right">Marge courante</TableHead>
                    <TableHead className="text-right">Marge précédente</TableHead>
                    <TableHead className="text-right">Croiss. marge</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {moduleRows.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        {MODULE_LABEL[r.dimension] ?? r.dimension}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtTnd(r.currentCa)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {fmtTnd(r.prevCa)}
                      </TableCell>
                      <TableCell className="text-right">
                        {growthBadge(r.caGrowthRate)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtTnd(r.currentMargin)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {fmtTnd(r.prevMargin)}
                      </TableCell>
                      <TableCell className="text-right">
                        {growthBadge(r.marginGrowthRate)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Canaux leads */}
      <Card>
        <CardHeader>
          <CardTitle>Canaux leads ({channelRows.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm">Chargement…</p>
          ) : channelRows.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Aucun lead sur la période.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Canal</TableHead>
                    <TableHead className="text-right">Leads courants</TableHead>
                    <TableHead className="text-right">Leads précédents</TableHead>
                    <TableHead className="text-right">Croissance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {channelRows.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        {CHANNEL_LABEL[r.dimension] ?? r.dimension}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {r.currentLeads}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {r.prevLeads}
                      </TableCell>
                      <TableCell className="text-right">
                        {growthBadge(r.leadsGrowthRate)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Produits leads */}
      <Card>
        <CardHeader>
          <CardTitle>Produits leads ({productRows.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm">Chargement…</p>
          ) : productRows.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Aucun lead sur la période.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produit</TableHead>
                    <TableHead className="text-right">Leads courants</TableHead>
                    <TableHead className="text-right">Leads précédents</TableHead>
                    <TableHead className="text-right">Croissance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productRows.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        {PRODUCT_LABEL[r.dimension] ?? r.dimension}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {r.currentLeads}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {r.prevLeads}
                      </TableCell>
                      <TableCell className="text-right">
                        {growthBadge(r.leadsGrowthRate)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
