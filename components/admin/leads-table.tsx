"use client"

/**
 * CRM / Leads — table de gestion staff (`/admin/support`). Suit le même
 * patron que ValidationsFilterableTable (recherche + filtre statut côté
 * client, actions par ligne).
 */

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Search, Mail, Phone, Loader2 } from "lucide-react"
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
import { updateLeadStatus } from "@/lib/admin/leads-actions"
import type { LeadRow, LeadStatus } from "@/lib/crm/leads-core"

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

function LeadStatusCell({ lead }: { lead: LeadRow }) {
  const [status, setStatus] = useState<LeadStatus>(lead.status)
  const [updatedAt, setUpdatedAt] = useState(() => new Date(lead.updatedAt))
  const [pending, setPending] = useState(false)

  function handleChange(value: string) {
    const next = value as LeadStatus
    if (next === status || pending) return
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
    </div>
  )
}

export function LeadsTable({ leads }: { leads: LeadRow[] }) {
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return leads.filter((lead) => {
      if (statusFilter !== "all" && lead.status !== statusFilter) return false
      if (q) {
        const haystack = [lead.firstName, lead.lastName, lead.email, lead.phone, lead.productLabel]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [leads, search, statusFilter])

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
                <TableHead>Statut</TableHead>
                <TableHead>Reçu le</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
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
                      <LeadStatusCell lead={lead} />
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(lead.createdAt).toLocaleDateString("fr-FR", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
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
