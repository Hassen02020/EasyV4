/**
 * CAMPAIGN-PERF-UI-01 — premier consommateur admin du moteur
 * CAMPAIGN-PERFORMANCE-01 (lib/crm/campaign-performance-core.ts,
 * commit 155d540). Le moteur calculait exposés/convertis/CA/marge mais
 * aucune interface ne le lisait (gap confirmé par audit 2026-10-08).
 *
 * CAMPAIGN-MGMT-01 (2026-10-08) — ajout gestion : bouton Annuler pour
 * campagnes actives/draft, drill-down cibles par campagne.
 *
 * V1 read+manage : visibilité des performances + annulation + cibles.
 * Accès : super_admin / manager / agent_resa + agencyType="ota"
 * (assertSupportStaff dans les actions — aucune garde supplémentaire
 * ici, même convention que /admin/analytics/niches).
 */

"use client"

import { useEffect, useState, useTransition } from "react"
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
import { listCampaignPerformance } from "@/lib/admin/campaign-performance-actions"
import type { CampaignPerformanceRow } from "@/lib/admin/campaign-performance-actions"
import {
  cancelCampaign,
  getCampaignTargets,
} from "@/lib/admin/campaign-mgmt-actions"
import type { CampaignTargetRow } from "@/lib/admin/campaign-mgmt-actions"

const CHANNEL_LABEL: Record<string, string> = {
  email: "E-mail",
  sms: "SMS",
  whatsapp: "WhatsApp",
  push: "Push",
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Brouillon",
  active: "Active",
  completed: "Terminée",
  cancelled: "Annulée",
}

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  draft: "outline",
  active: "default",
  completed: "secondary",
  cancelled: "destructive",
}

const DELIVERY_LABEL: Record<string, string> = {
  pending: "En attente",
  sent: "Envoyé",
  failed: "Échec",
  skipped: "Ignoré",
}

function fmtTnd(tnd: string) {
  const n = parseFloat(tnd)
  return Number.isFinite(n)
    ? new Intl.NumberFormat("fr-TN", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(n) + " TND"
    : "—"
}

function convRate(exposed: number, converted: number) {
  if (exposed === 0) return "—"
  return ((converted / exposed) * 100).toFixed(1) + "%"
}

function CampaignTargetsPanel({
  campaignId,
  onClose,
}: {
  campaignId: string
  onClose: () => void
}) {
  const [targets, setTargets] = useState<CampaignTargetRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      const result = await getCampaignTargets(campaignId)
      if (cancelled) return
      if (result.ok) {
        setTargets(result.targets)
      } else {
        setError(result.error)
      }
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount
    load()
    return () => {
      cancelled = true
    }
  }, [campaignId])

  return (
    <Card className="mt-2 border-muted">
      <CardHeader className="flex flex-row items-center justify-between py-3">
        <CardTitle className="text-sm">
          Cibles ({loading ? "…" : targets.length})
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Fermer
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-muted-foreground text-xs">Chargement…</p>
        ) : error ? (
          <p className="text-destructive text-xs">{error}</p>
        ) : targets.length === 0 ? (
          <p className="text-muted-foreground text-xs">Aucune cible.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Contact ID</TableHead>
                  <TableHead className="text-xs">Livraison</TableHead>
                  <TableHead className="text-xs">Consentement</TableHead>
                  <TableHead className="text-xs">Livré le</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {targets.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-xs">
                      {t.contactId.slice(0, 8)}…
                    </TableCell>
                    <TableCell className="text-xs">
                      {DELIVERY_LABEL[t.deliveryStatus] ?? t.deliveryStatus}
                    </TableCell>
                    <TableCell className="text-xs">
                      {t.consentStatusAtSnapshot ? "✓" : "✗"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {t.deliveredAt
                        ? new Date(t.deliveredAt).toLocaleString("fr-FR", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function CampaignAnalyticsPage() {
  const [rows, setRows] = useState<CampaignPerformanceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function load() {
    setLoading(true)
    setLoadError(null)
    const result = await listCampaignPerformance()
    if (result.ok) {
      setRows(result.rows)
    } else {
      setRows([])
      setLoadError(result.error)
    }
    setLoading(false)
  }

  useEffect(() => {
    let cancelled = false
    async function run() {
      setLoading(true)
      setLoadError(null)
      const result = await listCampaignPerformance()
      if (cancelled) return
      if (result.ok) {
        setRows(result.rows)
      } else {
        setRows([])
        setLoadError(result.error)
      }
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount
    run()
    return () => {
      cancelled = true
    }
  }, [])

  function handleCancel(campaignId: string) {
    if (cancellingId) return
    setCancellingId(campaignId)
    setCancelError(null)
    startTransition(async () => {
      const result = await cancelCampaign(campaignId)
      setCancellingId(null)
      if (!result.ok) {
        setCancelError(result.error)
      } else {
        // Reload list after cancel
        await load()
      }
    })
  }

  // Campagnes actives d'abord, puis par CA décroissant
  const sorted = [...rows].sort((a, b) => {
    if (a.status === "active" && b.status !== "active") return -1
    if (b.status === "active" && a.status !== "active") return 1
    return parseFloat(b.revenueTnd) - parseFloat(a.revenueTnd)
  })

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Performances Campagnes</h1>
        <p className="text-muted-foreground text-sm">
          Exposition, conversions, chiffre d&apos;affaires et marge par
          campagne CRM. Calculé depuis{" "}
          <code className="text-xs">campaign_targets</code> ⋈{" "}
          <code className="text-xs">campaign_attributions</code> ⋈{" "}
          <code className="text-xs">reservation_financials</code>.
        </p>
      </div>

      {loadError && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive text-sm">{loadError}</p>
          </CardContent>
        </Card>
      )}

      {cancelError && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive text-sm">{cancelError}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Campagnes ({sorted.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm">Chargement…</p>
          ) : sorted.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Aucune campagne — créez une première campagne CRM pour voir ses
              performances ici.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campagne</TableHead>
                      <TableHead>Canal</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="text-right">Exposés</TableHead>
                      <TableHead className="text-right">Envoyés</TableHead>
                      <TableHead className="text-right">Échecs</TableHead>
                      <TableHead className="text-right">Ignorés</TableHead>
                      <TableHead className="text-right">En attente</TableHead>
                      <TableHead className="text-right">Convertis</TableHead>
                      <TableHead className="text-right">Taux conv.</TableHead>
                      <TableHead className="text-right">CA (TND)</TableHead>
                      <TableHead className="text-right">Marge (TND)</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sorted.map((r) => (
                      <>
                        <TableRow key={r.campaignId}>
                          <TableCell className="font-medium">
                            <button
                              className="hover:underline text-left"
                              onClick={() =>
                                setExpandedId(
                                  expandedId === r.campaignId
                                    ? null
                                    : r.campaignId,
                                )
                              }
                            >
                              {r.name}
                            </button>
                          </TableCell>
                          <TableCell>
                            {CHANNEL_LABEL[r.channel] ?? r.channel}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={STATUS_VARIANT[r.status] ?? "outline"}
                            >
                              {STATUS_LABEL[r.status] ?? r.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {r.exposed}
                          </TableCell>
                          <TableCell className="text-right">{r.sent}</TableCell>
                          <TableCell className="text-right">
                            {r.failed > 0 ? (
                              <span className="text-destructive">
                                {r.failed}
                              </span>
                            ) : (
                              r.failed
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {r.skipped}
                          </TableCell>
                          <TableCell className="text-right">
                            {r.pending}
                          </TableCell>
                          <TableCell className="text-right">
                            {r.converted}
                          </TableCell>
                          <TableCell className="text-right">
                            {convRate(r.exposed, r.converted)}
                          </TableCell>
                          <TableCell className="text-right">
                            {fmtTnd(r.revenueTnd)}
                          </TableCell>
                          <TableCell className="text-right">
                            {fmtTnd(r.marginTnd)}
                          </TableCell>
                          <TableCell className="text-right">
                            {(r.status === "active" ||
                              r.status === "draft") && (
                              <Button
                                variant="destructive"
                                size="sm"
                                disabled={
                                  cancellingId === r.campaignId || isPending
                                }
                                onClick={() => handleCancel(r.campaignId)}
                              >
                                {cancellingId === r.campaignId
                                  ? "…"
                                  : "Annuler"}
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                        {expandedId === r.campaignId && (
                          <TableRow key={`${r.campaignId}-targets`}>
                            <TableCell colSpan={13} className="p-0 px-4 pb-4">
                              <CampaignTargetsPanel
                                campaignId={r.campaignId}
                                onClose={() => setExpandedId(null)}
                              />
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
