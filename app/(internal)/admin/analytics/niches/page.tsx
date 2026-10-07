/**
 * NICHE-UI-01 — premier consommateur admin du moteur NICHE
 * (lib/crm/niche-core.ts::getNicheSegmentsCore). Jusqu'ici le moteur
 * calculait market×product×intention×destination×period, mais aucune
 * interface ne le lisait (gap confirmé par l'audit CRM du 2026-10-07).
 *
 * V1 volontairement read-only, décision produit explicite (2026-10-07) :
 * pas d'action "lancer une campagne depuis ce segment" dans cette
 * version — uniquement la visibilité, qui manquait entièrement.
 *
 * Accès : réutilise `listNicheSegments()` (lib/admin/niche-actions.ts),
 * qui vérifie déjà super_admin/manager/agent_resa + agencyType="ota"
 * côté serveur (assertSupportStaff) — aucune garde supplémentaire
 * nécessaire ici, même convention que /admin/analytics/margins.
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
import { listNicheSegments } from "@/lib/admin/niche-actions"
import type { NicheSegment } from "@/lib/crm/niche-core"

const PRODUCT_TYPE_LABEL: Record<string, string> = {
  hotel: "Hôtel",
  omra: "Omra",
  package: "Voyage organisé",
  activity: "Activité",
  general: "Général",
}

const MARKET_LABEL: Record<string, string> = {
  tunisia: "Tunisie",
}

const INTENTION_LABEL: Record<string, string> = {
  groupe: "Groupe",
  transfert: "Transfert",
  a_la_carte: "À la carte",
  standard: "Standard",
}

export default function NicheAnalyticsPage() {
  const [segments, setSegments] = useState<NicheSegment[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setLoadError(null)
      const result = await listNicheSegments()
      if (cancelled) return
      if (result.ok) {
        setSegments(result.segments)
      } else {
        setSegments([])
        setLoadError(result.error)
      }
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount
    load()
    return () => {
      cancelled = true
    }
  }, [])

  // Les plus gros volumes en premier — c'est ce que le staff veut voir
  // d'abord pour repérer une niche qui mérite une campagne/promo.
  const sorted = [...segments].sort((a, b) => b.volume - a.volume)

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Analyse Niche</h1>
        <p className="text-muted-foreground text-sm">
          Segments marché × produit × intention × destination × période,
          calculés depuis les leads capturés. Lecture seule — aucune action de
          campagne depuis cette page (V1).
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
          <CardTitle>Segments ({sorted.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm">Chargement…</p>
          ) : sorted.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Aucun segment — pas encore assez de leads avec les dimensions
              requises (marché/produit/intention) pour former un segment.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Marché</TableHead>
                  <TableHead>Produit</TableHead>
                  <TableHead>Intention</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Période</TableHead>
                  <TableHead className="text-right">Volume</TableHead>
                  <TableHead className="text-right">Convertis</TableHead>
                  <TableHead className="text-right">Taux conv.</TableHead>
                  <TableHead>Canal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((s, i) => (
                  <TableRow key={i}>
                    <TableCell>{MARKET_LABEL[s.market] ?? s.market}</TableCell>
                    <TableCell>
                      {PRODUCT_TYPE_LABEL[s.productType] ?? s.productType}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {INTENTION_LABEL[s.intention] ?? s.intention}
                      </Badge>
                    </TableCell>
                    <TableCell>{s.destination ?? "—"}</TableCell>
                    <TableCell>{s.period}</TableCell>
                    <TableCell className="text-right">{s.volume}</TableCell>
                    <TableCell className="text-right">
                      {s.convertedCount}
                    </TableCell>
                    <TableCell className="text-right">
                      {s.conversionRate}%
                    </TableCell>
                    <TableCell>{s.channel ?? "—"}</TableCell>
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
