"use client"

/**
 * CRM / Pipeline — vue Kanban 4 colonnes (Nouveau → Contacté → Converti → Clos)
 * pour /admin/support. Complète LeadsTable (vue tableau) sans la remplacer.
 * Réutilise les Server Actions et types existants — aucune nouvelle API.
 */

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import {
  ArrowRight,
  Check,
  Link2,
  Loader2,
  Mail,
  Phone,
  Search,
  X,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  updateLeadStatus,
  convertLead,
  searchReservationsForLeadLink,
} from "@/lib/admin/leads-actions"
import type {
  LeadRow,
  LeadStatus,
  ReservationLinkCandidate,
} from "@/lib/crm/leads-core"
import type { LeadScoreRuleMap } from "@/lib/crm/lead-scoring-core"
import { computeLeadScore } from "@/lib/crm/lead-scoring-core"
import type { LeadRelanceSettingsValue } from "@/lib/crm/lead-relance-core"
import { isLeadStale } from "@/lib/crm/lead-relance-core"
import { Customer360Button } from "@/components/admin/customer-360-panel"

const COLUMNS: { status: LeadStatus; label: string; color: string; dot: string }[] = [
  { status: "new", label: "Nouveau", color: "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30", dot: "bg-amber-400" },
  { status: "contacted", label: "Contacté", color: "border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/30", dot: "bg-blue-400" },
  { status: "converted", label: "Converti", color: "border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/30", dot: "bg-emerald-400" },
  { status: "closed", label: "Clos", color: "border-border bg-muted/40", dot: "bg-muted-foreground" },
]

const PRODUCT_TYPE_LABEL: Record<LeadRow["productType"], string> = {
  hotel: "Hôtel",
  omra: "Omra",
  package: "Voyage",
  activity: "Activité",
  general: "Général",
}

function ScoreDots({ score }: { score: number }) {
  const level = score >= 70 ? 3 : score >= 40 ? 2 : score >= 10 ? 1 : 0
  return (
    <span className="flex gap-0.5" aria-label={`Score ${score}`}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`inline-block h-2 w-2 rounded-full transition-colors ${
            i < level
              ? level === 3
                ? "bg-emerald-500"
                : level === 2
                  ? "bg-amber-500"
                  : "bg-blue-400"
              : "bg-muted-foreground/25"
          }`}
        />
      ))}
    </span>
  )
}

function ConvertDialog({
  lead,
  onCancel,
  onConverted,
}: {
  lead: LeadRow
  onCancel: () => void
  onConverted: () => void
}) {
  const [query, setQuery] = useState("")
  const [candidates, setCandidates] = useState<ReservationLinkCandidate[]>([])
  const [loading, setLoading] = useState(false)
  const [confirming, setConfirming] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    runSearch("")
    inputRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function runSearch(q: string) {
    setLoading(true)
    searchReservationsForLeadLink({ leadId: lead.id, query: q || undefined })
      .then((r) => {
        if (r.ok) setCandidates(r.reservations)
        else toast.error(r.error || "Échec de la recherche.")
      })
      .catch(() => toast.error("Erreur technique."))
      .finally(() => setLoading(false))
  }

  function handleConfirm(reservationId: string) {
    if (confirming) return
    setConfirming(reservationId)
    convertLead({ id: lead.id, reservationId })
      .then((r) => {
        if (r.ok) {
          toast.success("Demande convertie.")
          onConverted()
        } else {
          toast.error(r.error || "Échec.")
        }
      })
      .catch(() => toast.error("Erreur technique."))
      .finally(() => setConfirming(null))
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Convertir — {lead.firstName} {lead.lastName ?? ""}
          </DialogTitle>
        </DialogHeader>
        <p className="text-muted-foreground text-xs">
          Liez cette demande à la réservation réelle qu'elle a produite.
        </p>
        <div className="relative">
          <Search className="text-muted-foreground absolute top-1/2 start-3 h-4 w-4 -translate-y-1/2" />
          <Input
            ref={inputRef}
            placeholder="Réf., nom, email, téléphone…"
            className="ps-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") runSearch(query)
            }}
          />
        </div>
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
          </div>
        ) : candidates.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center text-sm">
            Aucune réservation trouvée. Affinez la recherche.
          </p>
        ) : (
          <div className="max-h-60 space-y-1 overflow-y-auto">
            {candidates.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-md border p-2 text-sm"
              >
                <div>
                  <span className="font-medium">{c.publicRef}</span>
                  <span className="text-muted-foreground ml-2">
                    {c.customerFirstName} {c.customerLastName}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={confirming !== null}
                  onClick={() => handleConfirm(c.id)}
                >
                  {confirming === c.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Check className="h-3 w-3" />
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function LeadCard({
  lead,
  scoreRules,
  relanceSettings,
  onStatusChange,
}: {
  lead: LeadRow
  scoreRules: LeadScoreRuleMap
  relanceSettings: LeadRelanceSettingsValue
  onStatusChange: (id: string, next: LeadStatus | null) => void
}) {
  const [busy, setBusy] = useState<LeadStatus | null>(null)
  const [showConvert, setShowConvert] = useState(false)
  const score = computeLeadScore(lead, scoreRules)
  const stale = isLeadStale(lead, relanceSettings)

  async function move(next: LeadStatus) {
    setBusy(next)
    const result = await updateLeadStatus({ id: lead.id, status: next }).catch(
      () => ({ ok: false as const, error: "Erreur technique." }),
    )
    if (result.ok) {
      onStatusChange(lead.id, next)
    } else {
      toast.error(result.error || "Échec.")
    }
    setBusy(null)
  }

  return (
    <>
      <div
        className={`bg-card rounded-lg border p-3 shadow-sm space-y-2 ${stale ? "border-amber-400/60" : ""}`}
      >
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight">
              {lead.firstName} {lead.lastName ?? ""}
            </p>
            <p className="text-muted-foreground text-xs">
              {new Date(lead.createdAt).toLocaleDateString("fr-FR", {
                day: "numeric",
                month: "short",
              })}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <ScoreDots score={score.total} />
            <Customer360Button
                leadId={lead.id}
                leadName={`${lead.firstName}${lead.lastName ? " " + lead.lastName : ""}`}
              />
          </div>
        </div>

        <Badge variant="outline" className="text-[10px] font-medium">
          {PRODUCT_TYPE_LABEL[lead.productType]}
          {lead.productLabel ? ` — ${lead.productLabel}` : ""}
        </Badge>

        <div className="flex flex-wrap gap-2">
          {lead.email && (
            <a
              href={`mailto:${lead.email}`}
              className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
            >
              <Mail className="h-3 w-3" />
              <span className="max-w-[120px] truncate">{lead.email}</span>
            </a>
          )}
          {lead.phone && (
            <a
              href={`tel:${lead.phone}`}
              className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
            >
              <Phone className="h-3 w-3" />
              {lead.phone}
            </a>
          )}
        </div>

        {(lead.status === "new" || lead.status === "contacted") && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {lead.status === "new" && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 text-xs"
                disabled={busy !== null}
                onClick={() => move("contacted")}
              >
                {busy === "contacted" ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <ArrowRight className="h-3 w-3" />
                )}
                Contacté
              </Button>
            )}
            {lead.status === "contacted" && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 text-xs text-emerald-600 hover:text-emerald-700"
                disabled={busy !== null}
                onClick={() => setShowConvert(true)}
              >
                <Link2 className="h-3 w-3" />
                Convertir
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground h-7 gap-1 text-xs"
              disabled={busy !== null}
              onClick={() => move("closed")}
            >
              {busy === "closed" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <X className="h-3 w-3" />
              )}
              Clôturer
            </Button>
          </div>
        )}
      </div>

      {showConvert && (
        <ConvertDialog
          lead={lead}
          onCancel={() => setShowConvert(false)}
          onConverted={() => {
            setShowConvert(false)
            onStatusChange(lead.id, "converted")
          }}
        />
      )}
    </>
  )
}

export function LeadPipeline({
  leads: initialLeads,
  scoreRules,
  relanceSettings,
}: {
  leads: LeadRow[]
  scoreRules: LeadScoreRuleMap
  relanceSettings: LeadRelanceSettingsValue
}) {
  const [leads, setLeads] = useState<LeadRow[]>(initialLeads)

  function handleStatusChange(id: string, next: LeadStatus | null) {
    if (next === null) return
    setLeads((prev) =>
      prev.map((l) => (l.id === id ? { ...l, status: next } : l)),
    )
  }

  const byStatus = (status: LeadStatus) => leads.filter((l) => l.status === status)

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {COLUMNS.map((col) => {
        const colLeads = byStatus(col.status)
        return (
          <div
            key={col.status}
            className={`flex min-w-[260px] flex-col rounded-xl border-2 ${col.color}`}
          >
            <div className="flex items-center gap-2 px-3 py-2.5">
              <span className={`h-2.5 w-2.5 rounded-full ${col.dot}`} />
              <span className="text-sm font-semibold">{col.label}</span>
              <span className="bg-background text-muted-foreground ms-auto rounded-full px-2 py-0.5 text-xs font-medium">
                {colLeads.length}
              </span>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-2" style={{ maxHeight: "calc(100vh - 260px)", minHeight: 120 }}>
              {colLeads.length === 0 ? (
                <p className="text-muted-foreground py-6 text-center text-xs">
                  Aucune demande
                </p>
              ) : (
                colLeads.map((lead) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    scoreRules={scoreRules}
                    relanceSettings={relanceSettings}
                    onStatusChange={handleStatusChange}
                  />
                ))
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
