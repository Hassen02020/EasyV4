/**
 * CAMPAIGN-ENGINE-01 — "Quelles campagnes lancer ?"
 *
 * Proposals de campagnes dérivées des signaux Action Engine.
 * Chaque proposal est prêt à être passé à createCampaignCore.
 *
 * Réutilise getCampaignEngine (lib/admin/campaign-engine-actions.ts).
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
import { getCampaignEngine } from "@/lib/admin/campaign-engine-actions"
import type { CampaignProposal } from "@/lib/crm/campaign-engine-core"
import { createAndLaunchCampaign } from "@/lib/admin/campaign-lifecycle-actions"

const WINDOW_OPTIONS: { label: string; value: 4 | 8 | 12 }[] = [
  { label: "4 semaines", value: 4 },
  { label: "8 semaines", value: 8 },
  { label: "12 semaines", value: 12 },
]

const PRIORITY_CONFIG: Record<
  string,
  {
    label: string
    variant: "default" | "secondary" | "outline" | "destructive"
  }
> = {
  urgent: { label: "Urgent", variant: "destructive" },
  haute: { label: "Haute", variant: "default" },
  normale: { label: "Normale", variant: "secondary" },
  faible: { label: "Faible", variant: "outline" },
}

const CHANNEL_LABEL: Record<string, string> = {
  phone: "📞 Appel",
  whatsapp: "💬 WhatsApp",
  email: "✉️ Email",
}

type Draft = { name: string; message: string; confirmed: boolean }

type LaunchState =
  | { status: "idle" }
  | { status: "launching" }
  | { status: "done"; campaignId: string; targetCount: number }
  | { status: "error"; error: string }

export default function CampaignEnginePage() {
  const [proposals, setProposals] = useState<CampaignProposal[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [windowWeeks, setWindowWeeks] = useState<4 | 8 | 12>(4)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [launchStates, setLaunchStates] = useState<Record<string, LaunchState>>(
    {},
  )

  // CRM-CAMPAIGN-LAUNCH-CONFIRM-01 (G-34) : édition + confirmation avant
  // tout envoi réel ; le lancement direct en un clic n'existe plus.
  const [drafts, setDrafts] = useState<Record<string, Draft | undefined>>({})

  function openDraft(p: CampaignProposal) {
    setDrafts((prev) => ({
      ...prev,
      [p.proposalId]: {
        name: p.suggestedName,
        message: p.suggestedMessage,
        confirmed: false,
      },
    }))
  }

  function updateDraft(proposalId: string, patch: Partial<Draft>) {
    setDrafts((prev) => {
      const current = prev[proposalId]
      return current
        ? { ...prev, [proposalId]: { ...current, ...patch } }
        : prev
    })
  }

  function setLaunch(proposalId: string, state: LaunchState) {
    setLaunchStates((prev) => ({ ...prev, [proposalId]: state }))
  }

  async function handleLaunch(p: CampaignProposal) {
    const draft = drafts[p.proposalId]
    if (!draft?.confirmed || !draft.name.trim() || !draft.message.trim()) return
    setLaunch(p.proposalId, { status: "launching" })
    const result = await createAndLaunchCampaign({
      name: draft.name.trim(),
      objective: p.suggestedObjective,
      crmChannel: p.crmChannel,
      message: draft.message,
      leadIds: p.leadIds,
    })
    if (result.ok) {
      setLaunch(p.proposalId, {
        status: "done",
        campaignId: result.campaignId,
        targetCount: result.targetCount,
      })
    } else {
      setLaunch(p.proposalId, { status: "error", error: result.error })
    }
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setLoadError(null)
      const result = await getCampaignEngine(windowWeeks)
      if (cancelled) return
      if (result.ok) {
        setProposals(result.proposals)
      } else {
        setProposals([])
        setLoadError(result.error)
      }
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [windowWeeks])

  const totalLeads = proposals.reduce((s, p) => s + p.leadCount, 0)
  const urgentCount = proposals.filter((p) => p.priority === "urgent").length

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Campaign Engine</h1>
            <p className="text-muted-foreground text-sm">
              Propositions de campagnes dérivées des signaux Radar × VIP.{" "}
              {proposals.length > 0 &&
                `${proposals.length} proposition${proposals.length > 1 ? "s" : ""} — ${totalLeads} contacts ciblés.`}
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

      {!loading && !loadError && proposals.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground text-xs tracking-wide uppercase">
                Propositions
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {proposals.length}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground text-xs tracking-wide uppercase">
                Contacts ciblés
              </p>
              <p className="text-primary mt-1 text-2xl font-semibold tabular-nums">
                {totalLeads}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground text-xs tracking-wide uppercase">
                Urgentes
              </p>
              <p className="text-destructive mt-1 text-2xl font-semibold tabular-nums">
                {urgentCount}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Propositions de campagnes ({proposals.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm">Chargement…</p>
          ) : proposals.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Aucune proposition — les campagnes apparaîtront quand des signaux
              convergents seront détectés.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>Campagne suggérée</TableHead>
                    <TableHead>Canal</TableHead>
                    <TableHead>Priorité</TableHead>
                    <TableHead className="text-right">Contacts</TableHead>
                    <TableHead>Urgence</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {proposals.map((p, i) => {
                    const prio = PRIORITY_CONFIG[p.priority] ?? {
                      label: p.priority,
                      variant: "secondary" as const,
                    }
                    const isExpanded = expanded === p.proposalId
                    return (
                      <>
                        <TableRow
                          key={p.proposalId}
                          className="cursor-pointer"
                          onClick={() =>
                            setExpanded(isExpanded ? null : p.proposalId)
                          }
                        >
                          <TableCell className="text-muted-foreground text-sm tabular-nums">
                            {i + 1}
                          </TableCell>
                          <TableCell>
                            <p className="font-medium">{p.suggestedName}</p>
                            <p className="text-muted-foreground line-clamp-1 text-xs">
                              {p.suggestedObjective}
                            </p>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {CHANNEL_LABEL[p.channel] ?? p.channel}
                          </TableCell>
                          <TableCell>
                            <Badge variant={prio.variant}>{prio.label}</Badge>
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {p.leadCount}
                          </TableCell>
                          <TableCell className="text-sm tabular-nums">
                            {p.urgencyWindow}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {p.topCombinedScore}
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow key={`${p.proposalId}-detail`}>
                            <TableCell />
                            <TableCell colSpan={6} className="pb-4">
                              <div className="bg-muted/40 space-y-3 rounded-md p-3 text-sm">
                                <div>
                                  <p className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">
                                    Objectif
                                  </p>
                                  <p>{p.suggestedObjective}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">
                                    Message template
                                  </p>
                                  <pre className="bg-muted rounded p-2 font-mono text-xs whitespace-pre-wrap">
                                    {p.suggestedMessage}
                                  </pre>
                                </div>
                                <p className="text-muted-foreground font-mono text-xs">
                                  canal CRM : {p.crmChannel} · urgence{" "}
                                  {p.urgencyHours}h · signal {p.actionCount}{" "}
                                  action
                                  {p.actionCount > 1 ? "s" : ""} groupée
                                  {p.actionCount > 1 ? "s" : ""} ·{" "}
                                  {p.marketTrend} {p.marketGrowthRate}
                                </p>
                                <div className="flex items-center gap-3 pt-1">
                                  {(() => {
                                    const ls = launchStates[p.proposalId] ?? {
                                      status: "idle",
                                    }
                                    if (ls.status === "done") {
                                      return (
                                        <p className="text-sm font-medium text-green-700 dark:text-green-400">
                                          ✓ Campagne créée — {ls.targetCount}{" "}
                                          contact{ls.targetCount > 1 ? "s" : ""}{" "}
                                          ciblé{ls.targetCount > 1 ? "s" : ""}
                                        </p>
                                      )
                                    }
                                    const draft = drafts[p.proposalId]
                                    if (!draft) {
                                      return (
                                        <Button
                                          size="sm"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            openDraft(p)
                                          }}
                                        >
                                          Préparer la campagne…
                                        </Button>
                                      )
                                    }
                                    const sendable =
                                      draft.confirmed &&
                                      draft.name.trim().length > 0 &&
                                      draft.message.trim().length > 0 &&
                                      ls.status !== "launching"
                                    return (
                                      <div
                                        className="border-border bg-background w-full space-y-3 rounded-md border p-3"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <label className="block space-y-1">
                                          <span className="text-xs font-medium">
                                            Nom de la campagne
                                          </span>
                                          <input
                                            value={draft.name}
                                            maxLength={200}
                                            onChange={(e) =>
                                              updateDraft(p.proposalId, {
                                                name: e.target.value,
                                                confirmed: false,
                                              })
                                            }
                                            className="border-border bg-background w-full rounded-md border px-3 py-2 text-sm"
                                          />
                                        </label>
                                        <label className="block space-y-1">
                                          <span className="text-xs font-medium">
                                            Message envoyé au client
                                          </span>
                                          <textarea
                                            value={draft.message}
                                            rows={7}
                                            onChange={(e) =>
                                              updateDraft(p.proposalId, {
                                                message: e.target.value,
                                                confirmed: false,
                                              })
                                            }
                                            className="border-border bg-background w-full rounded-md border px-3 py-2 text-sm"
                                          />
                                          <span className="text-muted-foreground block text-xs">
                                            « [Prénom] » est remplacé par le
                                            prénom du client, ou retiré
                                            s&apos;il est inconnu. Seuls les
                                            contacts ayant consenti reçoivent le
                                            message.
                                          </span>
                                        </label>
                                        <label className="flex items-start gap-2 text-sm">
                                          <input
                                            type="checkbox"
                                            checked={draft.confirmed}
                                            onChange={(e) =>
                                              updateDraft(p.proposalId, {
                                                confirmed: e.target.checked,
                                              })
                                            }
                                            className="mt-1"
                                          />
                                          <span>
                                            Je confirme l&apos;envoi réel (
                                            {CHANNEL_LABEL[p.channel] ??
                                              p.channel}
                                            ) à {p.leadCount} contact
                                            {p.leadCount > 1 ? "s" : ""}{" "}
                                            maximum.
                                          </span>
                                        </label>
                                        {ls.status === "error" && (
                                          <p className="text-destructive text-sm">
                                            {ls.error}
                                          </p>
                                        )}
                                        <div className="flex flex-wrap gap-2">
                                          <Button
                                            size="sm"
                                            disabled={!sendable}
                                            onClick={() => handleLaunch(p)}
                                          >
                                            {ls.status === "launching"
                                              ? "Lancement…"
                                              : "Lancer la campagne"}
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            disabled={ls.status === "launching"}
                                            onClick={() =>
                                              setDrafts((prev) => ({
                                                ...prev,
                                                [p.proposalId]: undefined,
                                              }))
                                            }
                                          >
                                            Annuler
                                          </Button>
                                        </div>
                                      </div>
                                    )
                                  })()}
                                </div>
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
