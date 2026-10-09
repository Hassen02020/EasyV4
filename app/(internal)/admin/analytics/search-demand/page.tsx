/**
 * SEARCH-DEMAND-DISPLAY-01 — vue admin read-only des tendances de
 * demande hôtel issues de search_demand_signals (BEHAVIORAL-SIGNAL-01,
 * PR #146). Rend visible une donnée déjà capturée en production mais
 * jusque-là invisible pour le staff.
 *
 * V1 read-only, même décision que NICHE-UI-01 : aucune action depuis
 * cette page. Accès : assertSupportStaff (super_admin/manager/
 * agent_resa + agencyType="ota") côté serveur dans listSearchDemandSignals.
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
import { listSearchDemandSignals } from "@/lib/admin/search-demand-actions"
import type { SearchDemandRow } from "@/lib/crm/search-demand-core"

const PRODUCT_TYPE_LABEL: Record<string, string> = {
  hotel: "Hôtel",
}

export default function SearchDemandAnalyticsPage() {
  const [rows, setRows] = useState<SearchDemandRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setLoadError(null)
      const result = await listSearchDemandSignals()
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

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Demande de recherche</h1>
        <p className="text-muted-foreground text-sm">
          Top destinations sur les 30 derniers jours, triées par volume de
          recherches agrégées. Lecture seule — pilote hôtel uniquement (V1).
        </p>
      </div>

      {loadError && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive text-sm">{loadError}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Destinations ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm">Chargement…</p>
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Aucune recherche enregistrée sur les 30 derniers jours.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Destination</TableHead>
                  <TableHead>Produit</TableHead>
                  <TableHead className="text-right">Recherches (30j)</TableHead>
                  <TableHead>Dernière recherche</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">
                      {r.destination}
                    </TableCell>
                    <TableCell>
                      {PRODUCT_TYPE_LABEL[r.productType] ?? r.productType}
                    </TableCell>
                    <TableCell className="font-tabular-nums text-right">
                      {r.totalCount.toLocaleString("fr-TN")}
                    </TableCell>
                    <TableCell>{r.lastSearchDate}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
