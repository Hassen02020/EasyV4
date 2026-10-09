/**
 * CONVERSION-FUNNEL-01 — répond à la question pilier 8 :
 * "Peut-on relier la conversion à sa source ?"
 *
 * Vue funnel leads par canal × produit : nouveaux → contactés →
 * convertis → taux → CA → marge. Toute la vérité financière vient de
 * `reservationFinancials` via jointure — aucun recalcul.
 *
 * Accès : super_admin / manager / agent_resa + agencyType="ota"
 * (assertSupportStaff dans getConversionFunnel — même convention que
 * les autres pages /admin/analytics/*).
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
import { getConversionFunnel } from "@/lib/admin/conversion-funnel-actions"
import type { ConversionFunnelRow } from "@/lib/admin/conversion-funnel-actions"

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

function rateColor(rate: string) {
  const n = parseFloat(rate)
  if (n >= 20) return "default"
  if (n >= 10) return "secondary"
  return "outline"
}

export default function ConversionFunnelPage() {
  const [rows, setRows] = useState<ConversionFunnelRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setLoadError(null)
      const result = await getConversionFunnel()
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

  // Convertis d'abord, puis par volume total
  const sorted = [...rows].sort(
    (a, b) => b.convertedCount - a.convertedCount || b.total - a.total,
  )

  const totals = sorted.reduce(
    (acc, r) => ({
      total: acc.total + r.total,
      converted: acc.converted + r.convertedCount,
      revenue: acc.revenue + parseFloat(r.revenueTnd),
      margin: acc.margin + parseFloat(r.marginTnd),
    }),
    { total: 0, converted: 0, revenue: 0, margin: 0 },
  )

  const globalRate =
    totals.total > 0
      ? ((totals.converted / totals.total) * 100).toFixed(1)
      : "0.0"

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Funnel de Conversion</h1>
        <p className="text-muted-foreground text-sm">
          Leads par canal × produit — nouveaux, contactés, convertis, taux de
          conversion, CA et marge. CA et marge lus depuis{" "}
          <code className="text-xs">reservation_financials</code> via jointure
          sur les leads convertis.
        </p>
      </div>

      {loadError && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive text-sm">{loadError}</p>
          </CardContent>
        </Card>
      )}

      {!loading && !loadError && sorted.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground text-xs uppercase tracking-wide">
                Total leads
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {totals.total}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground text-xs uppercase tracking-wide">
                Convertis
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {totals.converted}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground text-xs uppercase tracking-wide">
                Taux global
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {globalRate}%
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground text-xs uppercase tracking-wide">
                CA converti
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {fmtTnd(totals.revenue.toFixed(2))}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Par canal × produit ({sorted.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm">Chargement…</p>
          ) : sorted.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Aucun lead capturé — les leads apparaîtront ici dès les premières
              demandes B2C.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Canal</TableHead>
                  <TableHead>Produit</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Nouveaux</TableHead>
                  <TableHead className="text-right">Contactés</TableHead>
                  <TableHead className="text-right">Convertis</TableHead>
                  <TableHead className="text-right">Fermés</TableHead>
                  <TableHead className="text-right">Taux conv.</TableHead>
                  <TableHead className="text-right">CA (TND)</TableHead>
                  <TableHead className="text-right">Marge (TND)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      {CHANNEL_LABEL[r.channel ?? ""] ?? r.channel ?? "—"}
                    </TableCell>
                    <TableCell>
                      {PRODUCT_LABEL[r.productType] ?? r.productType}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.total}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.newCount}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.contactedCount}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {r.convertedCount}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.closedCount}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={rateColor(r.conversionRate)}>
                        {r.conversionRate}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtTnd(r.revenueTnd)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtTnd(r.marginTnd)}
                    </TableCell>
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
