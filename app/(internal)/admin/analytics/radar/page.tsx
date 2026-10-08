/**
 * RADAR-METIER-01 — "Qu'est-ce qui bouge ?"
 *
 * Vue classée des signaux de croissance : chaque ligne représente une
 * dimension (module, canal, produit, destination) classée par force de
 * signal (volume × croissance). La couleur du badge indique la tendance.
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
import { getRadarMetier } from "@/lib/admin/radar-metier-actions"
import type { RadarSignal, SignalTrend } from "@/lib/admin/radar-metier-actions"

const DIMENSION_TYPE_LABEL: Record<string, string> = {
  module: "Module",
  channel: "Canal",
  productType: "Produit",
  destination: "Destination",
}

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

function dimensionLabel(type: string, value: string): string {
  if (type === "module") return MODULE_LABEL[value] ?? value
  if (type === "channel") return CHANNEL_LABEL[value] ?? value
  if (type === "productType") return PRODUCT_LABEL[value] ?? value
  return value // destination — texte libre
}

const TREND_CONFIG: Record<
  SignalTrend,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
> = {
  forte_hausse: { label: "↑↑ Forte hausse", variant: "default" },
  hausse: { label: "↑ Hausse", variant: "default" },
  stable: { label: "→ Stable", variant: "secondary" },
  baisse: { label: "↓ Baisse", variant: "outline" },
  forte_baisse: { label: "↓↓ Forte baisse", variant: "destructive" },
  nouveau: { label: "✦ Nouveau", variant: "secondary" },
}

type Window = 4 | 8 | 12

export default function RadarMetierPage() {
  const [windowWeeks, setWindowWeeks] = useState<Window>(4)
  const [signals, setSignals] = useState<RadarSignal[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setLoadError(null)
      const result = await getRadarMetier(windowWeeks)
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

  // KPI rapides
  const topSignal = signals[0]
  const enHausse = signals.filter(
    (s) => s.trend === "forte_hausse" || s.trend === "hausse" || s.trend === "nouveau",
  ).length
  const enBaisse = signals.filter(
    (s) => s.trend === "forte_baisse" || s.trend === "baisse",
  ).length

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Radar Métier</h1>
          <p className="text-muted-foreground text-sm">
            Signaux de croissance classés par force — modules (CA), canaux,
            produits et destinations (leads). Période courante vs précédente.
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

      {!loading && !loadError && signals.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground text-xs uppercase tracking-wide">
                Signaux actifs
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {signals.length}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground text-xs uppercase tracking-wide">
                En hausse
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-green-600 dark:text-green-400">
                {enHausse}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground text-xs uppercase tracking-wide">
                En baisse
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-red-600 dark:text-red-400">
                {enBaisse}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {topSignal && !loading && (
        <Card className="border-primary/30">
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Signal le plus fort
            </p>
            <p className="mt-1 text-lg font-semibold">
              {dimensionLabel(topSignal.dimensionType, topSignal.dimension)}
              <span className="text-muted-foreground ml-2 text-sm font-normal">
                ({DIMENSION_TYPE_LABEL[topSignal.dimensionType]})
              </span>
            </p>
            <p className="text-muted-foreground text-sm">
              Volume courant : {topSignal.currentVolume.toLocaleString("fr-TN")}
              {topSignal.dimensionType === "module" ? " TND" : " leads"} · {topSignal.growthRate}
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Tous les signaux ({signals.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm">Chargement…</p>
          ) : signals.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Aucun signal détecté — les signaux apparaîtront dès les premières
              réservations et demandes.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>Dimension</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Tendance</TableHead>
                    <TableHead className="text-right">Volume courant</TableHead>
                    <TableHead className="text-right">Volume précédent</TableHead>
                    <TableHead className="text-right">Croissance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {signals.map((s, i) => {
                    const trend = TREND_CONFIG[s.trend]
                    return (
                      <TableRow key={i}>
                        <TableCell className="text-muted-foreground tabular-nums text-sm">
                          {i + 1}
                        </TableCell>
                        <TableCell className="font-medium">
                          {dimensionLabel(s.dimensionType, s.dimension)}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {DIMENSION_TYPE_LABEL[s.dimensionType]}
                        </TableCell>
                        <TableCell>
                          <Badge variant={trend.variant}>{trend.label}</Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {s.currentVolume.toLocaleString("fr-TN")}
                          {s.dimensionType === "module" ? " TND" : ""}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {s.prevVolume.toLocaleString("fr-TN")}
                          {s.dimensionType === "module" ? " TND" : ""}
                        </TableCell>
                        <TableCell className="text-right">
                          <span
                            className={
                              s.trend === "forte_hausse" || s.trend === "hausse"
                                ? "text-green-600 dark:text-green-400 font-medium"
                                : s.trend === "forte_baisse" || s.trend === "baisse"
                                  ? "text-red-600 dark:text-red-400 font-medium"
                                  : "text-muted-foreground"
                            }
                          >
                            {s.growthRate}
                          </span>
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
