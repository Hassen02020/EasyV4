"use client"

/**
 * CRM / Leads — table de gestion staff (`/admin/support`). Suit le même
 * patron que ValidationsFilterableTable (recherche + filtre statut côté
 * client, actions par ligne).
 */

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Search, Mail, Phone, Loader2, Link2, ExternalLink, AlertCircle } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { updateLeadStatus, convertLead, searchReservationsForLeadLink } from "@/lib/admin/leads-actions"
import type { LeadRow, LeadStatus, ReservationLinkCandidate } from "@/lib/crm/leads-core"
import { computeLeadScore, type LeadScoreRuleMap } from "@/lib/crm/lead-scoring-core"
import { isLeadStale, type LeadRelanceSettingsValue } from "@/lib/crm/lead-relance-core"
import { Customer360Button } from "@/components/admin/customer-360-panel"

const STATUS_LABEL: Record<LeadStatus, string> = {
  new: "Nouveau",
  contacted: "Contacté",
  converted: "Converti",
  closed: "Clôturé",
}

const STATUS_COLOR: Record<LeadStatus, string> = {
  new: "bg-amber-100 text-amber-800",
  contacted: "bg-blue-100 text-blue-800",
  converted: "bg-emerald-100 text-emerald-800",
  closed: "bg-gray-100 text-gray-800",
}

const PRODUCT_TYPE_LABEL: Record<LeadRow["productType"], string> = {
  hotel: "Hôtel",
  omra: "Omra",
  package: "Voyage organisé",
  activity: "Activité",
  general: "Général",
}

/**
 * Recherche + sélection d'une réservation réelle pour convertir un lead —
 * jamais un lien automatique (voir convertLeadCore, lib/crm/leads-core.ts).
 * Ouverte quand le staff choisit "Converti" dans le Select de statut ;
 * annuler laisse le statut inchangé.
 */
function ConvertLeadDialog({
  lead,
  onCancel,
  onConverted,
}: {
  lead: LeadRow
  onCancel: () => void
  onConverted: (reservationId: string) => void
}) {
  const [query, setQuery] = useState("")
  const [candidates, setCandidates] = useState<ReservationLinkCandidate[]>([])
  const [loading, setLoading] = useState(false)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)

  useEffect(() => {
    runSearch("")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function runSearch(q: string) {
    setLoading(true)
    searchReservationsForLeadLink({ leadId: lead.id, query: q || undefined })
      .then((result) => {
        setSearched(true)
        if (result.ok) {
          setCandidates(result.reservations)
        } else {
          toast.error(result.error || "Échec de la recherche.")
        }
      })
      .catch(() => toast.error("Erreur technique. Veuillez réessayer."))
      .finally(() => setLoading(false))
  }

  function handleConfirm(reservationId: string) {
    if (confirming) return
    setConfirming(reservationId)
    convertLead({ id: lead.id, reservationId })
      .then((result) => {
        if (result.ok) {
          toast.success("Demande marquée comme convertie.")
          onConverted(reservationId)
        } else {
          toast.error(result.error || "Échec de la conversion.")
        }
      })
      .catch(() => toast.error("Erreur technique. Veuillez réessayer."))
      .finally(() => setConfirming(null))
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Lier {lead.firstName} {lead.lastName ?? ""} à une réservation
          </DialogTitle>
        </DialogHeader>

        <p className="text-muted-foreground text-xs">
          Sélectionnez la réservation réelle produite par cette demande. Sans
          correspondance ci-dessous, recherchez par référence, nom, email ou
          téléphone.
        </p>

        <div className="relative">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Réf. réservation, nom, email, téléphone…"
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                runSearch(query)
              }
            }}
          />
        </div>

        <div className="max-h-72 space-y-2 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : candidates.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              {searched ? "Aucune réservation correspondante." : "Recherche…"}
            </p>
          ) : (
            candidates.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => handleConfirm(r.id)}
                disabled={confirming !== null}
                className="hover:border-primary hover:bg-primary/5 flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left text-sm transition-colors disabled:opacity-60"
              >
                <div>
                  <p className="font-medium">{r.publicRef}</p>
                  <p className="text-muted-foreground text-xs">
                    {r.customerFirstName} {r.customerLastName} — {r.customerEmail ?? r.customerPhone ?? "—"}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {new Date(r.createdAt).toLocaleDateString("fr-FR", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}{" "}
                    · {r.status}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{parseFloat(r.tndAmount).toFixed(2)} DT</span>
                  {confirming === r.id && <Loader2 className="h-4 w-4 animate-spin" />}
                </div>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function scoreTone(total: number): string {
  if (total >= 75) return "bg-emerald-100 text-emerald-800 border-emerald-200"
  if (total >= 50) return "bg-amber-100 text-amber-800 border-amber-200"
  return "bg-gray-100 text-gray-700 border-gray-200"
}

/** Score toujours transparent : le détail signal-par-signal est visible au survol, jamais un nombre opaque. */
function LeadScoreCell({ lead, rules }: { lead: LeadRow; rules: LeadScoreRuleMap }) {
  const score = useMemo(() => computeLeadScore(lead, rules), [lead, rules])
  return (
    <HoverCard openDelay={100}>
      <HoverCardTrigger asChild>
        <Badge variant="outline" className={`cursor-help font-semibold ${scoreTone(score.total)}`}>
          {score.total}
        </Badge>
      </HoverCardTrigger>
      <HoverCardContent className="w-72">
        <p className="mb-2 text-xs font-semibold">Détail du score</p>
        <ul className="space-y-1 text-xs">
          {score.breakdown.map((item) => (
            <li key={item.signal} className="flex items-center justify-between gap-2">
              <span className={item.matched ? "text-foreground" : "text-muted-foreground"}>{item.label}</span>
              <span className={item.points > 0 ? "font-medium text-emerald-700" : "text-muted-foreground"}>
                {item.matched ? `+${item.points}` : "0"}
              </span>
            </li>
          ))}
        </ul>
      </HoverCardContent>
    </HoverCard>
  )
}

function LeadStatusCell({ lead: initialLead }: { lead: LeadRow }) {
  const [lead, setLead] = useState(initialLead)
  const [status, setStatus] = useState<LeadStatus>(initialLead.status)
  const [updatedAt, setUpdatedAt] = useState(() => new Date(initialLead.updatedAt))
  const [pending, setPending] = useState(false)
  const [convertOpen, setConvertOpen] = useState(false)

  function handleChange(value: string) {
    const next = value as LeadStatus
    if (next === status || pending) return
    if (next === "converted") {
      setConvertOpen(true)
      return
    }
    setPending(true)
    updateLeadStatus({ id: lead.id, status: next })
      .then((result) => {
        if (result.ok) {
          setStatus(next)
          setUpdatedAt(new Date())
        } else {
          toast.error(result.error || "Échec de la mise à jour du statut.")
        }
      })
      .catch(() => toast.error("Erreur technique. Veuillez réessayer."))
      .finally(() => setPending(false))
  }

  function handleConverted(reservationId: string) {
    setStatus("converted")
    setUpdatedAt(new Date())
    setLead((l) => ({ ...l, reservationId, convertedAt: new Date() }))
    setConvertOpen(false)
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Badge className={STATUS_COLOR[status]}>{STATUS_LABEL[status]}</Badge>
        {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>
      <Select value={status} onValueChange={handleChange} disabled={pending}>
        <SelectTrigger className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(STATUS_LABEL) as LeadStatus[]).map((s) => (
            <SelectItem key={s} value={s}>
              {STATUS_LABEL[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {status !== "new" && (
        <p className="text-muted-foreground text-xs">
          Suivi le{" "}
          {updatedAt.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
        </p>
      )}
      {status === "converted" && lead.reservationId && (
        <Link
          href={`/admin/reservations/${lead.reservationId}`}
          className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
        >
          Réservation liée <ExternalLink className="h-3 w-3" />
        </Link>
      )}
      {convertOpen && (
        <ConvertLeadDialog
          lead={lead}
          onCancel={() => setConvertOpen(false)}
          onConverted={handleConverted}
        />
      )}
    </div>
  )
}

export function LeadsTable({
  leads,
  scoreRules,
  relanceSettings,
}: {
  leads: LeadRow[]
  scoreRules: LeadScoreRuleMap
  relanceSettings: LeadRelanceSettingsValue
}) {
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return leads.filter((lead) => {
      if (statusFilter === "stale") {
        if (!isLeadStale(lead, relanceSettings)) return false
      } else if (statusFilter !== "all" && lead.status !== statusFilter) {
        return false
      }
      if (q) {
        const haystack = [lead.firstName, lead.lastName, lead.email, lead.phone, lead.productLabel]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [leads, search, statusFilter, relanceSettings])

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-64">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Rechercher un contact..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              {(Object.keys(STATUS_LABEL) as LeadStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABEL[s]}
                </SelectItem>
              ))}
              {relanceSettings.isEnabled && <SelectItem value="stale">À relancer</SelectItem>}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contact</TableHead>
                <TableHead>Demande</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Reçu le</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    Aucune demande ne correspond à ces filtres.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((lead) => (
                  <TableRow key={lead.id} className="hover:bg-gray-50">
                    <TableCell>
                      <p className="font-medium">
                        {lead.firstName} {lead.lastName ?? ""}
                      </p>
                      <div className="text-muted-foreground mt-0.5 space-y-0.5 text-xs">
                        {lead.email && (
                          <p className="flex items-center gap-1">
                            <Mail className="h-3 w-3" /> {lead.email}
                          </p>
                        )}
                        {lead.phone && (
                          <p className="flex items-center gap-1">
                            <Phone className="h-3 w-3" /> {lead.phone}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{PRODUCT_TYPE_LABEL[lead.productType]}</Badge>
                      {lead.productLabel && (
                        <p className="text-muted-foreground mt-1 max-w-40 truncate text-xs">{lead.productLabel}</p>
                      )}
                    </TableCell>
                    <TableCell className="max-w-64 text-sm">
                      {lead.message ? (
                        <p className="line-clamp-2">{lead.message}</p>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <LeadScoreCell lead={lead} rules={scoreRules} />
                    </TableCell>
                    <TableCell>
                      <LeadStatusCell lead={lead} />
                      {isLeadStale(lead, relanceSettings) && (
                        <Badge variant="outline" className="mt-1 gap-1 border-amber-200 bg-amber-100 text-amber-800">
                          <AlertCircle className="h-3 w-3" /> À relancer
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(lead.createdAt).toLocaleDateString("fr-FR", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </TableCell>
                    <TableCell>
                      <Customer360Button
                        leadId={lead.id}
                        leadName={`${lead.firstName} ${lead.lastName ?? ""}`.trim()}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
