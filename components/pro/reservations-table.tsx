"use client"

import { useMemo, useState } from "react"
import {
  Search,
  Building2,
  Plane,
  Car,
  Moon,
  Sun,
  MoreVertical,
  Eye,
  Printer,
  FileText,
  XCircle,
  Clock,
  CheckCircle,
  CircleDot,
  TimerReset,
} from "lucide-react"

import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { formatTND } from "@/lib/pro/format"
import type { PartnerReservation } from "@/lib/pro/mock-tables"

const STATUS_META: Record<
  PartnerReservation["status"],
  { label: string; className: string; icon: typeof Clock }
> = {
  pending: {
    label: "En attente",
    className: "border-amber-300 bg-amber-100 text-amber-900",
    icon: Clock,
  },
  on_option: {
    label: "Sur option",
    className: "border-sky-300 bg-sky-100 text-sky-900",
    icon: TimerReset,
  },
  confirmed: {
    label: "Confirmée",
    className: "border-emerald-300 bg-emerald-100 text-emerald-900",
    icon: CheckCircle,
  },
  cancelled: {
    label: "Annulée",
    className: "border-red-300 bg-red-100 text-red-900",
    icon: XCircle,
  },
  completed: {
    label: "Soldée",
    className: "border-blue-300 bg-blue-100 text-blue-900",
    icon: CircleDot,
  },
}

const MODULE_META: Record<
  PartnerReservation["module"],
  { label: string; icon: typeof Building2 }
> = {
  hotel: { label: "Hôtel", icon: Building2 },
  flight: { label: "Vol", icon: Plane },
  package: { label: "Package", icon: Sun },
  activity: { label: "Activité", icon: Sun },
  omra: { label: "Omra", icon: Moon },
  transfer: { label: "Transfert", icon: Car },
}

interface ReservationsTableProps {
  rows: PartnerReservation[]
}

export function ReservationsTable({ rows }: ReservationsTableProps) {
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<string>("all")
  const [module, setModule] = useState<string>("all")
  const [refInput, setRefInput] = useState("")

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const refQ = refInput.trim().toLowerCase()
    return rows.filter((r) => {
      if (refQ && !r.ref.toLowerCase().includes(refQ)) return false
      if (status !== "all" && r.status !== status) return false
      if (module !== "all" && r.module !== module) return false
      if (
        q &&
        !r.clientName.toLowerCase().includes(q) &&
        !r.service.toLowerCase().includes(q)
      )
        return false
      return true
    })
  }, [rows, search, refInput, status, module])

  return (
    <div className="space-y-4">
      <section
        aria-label="Filtres réservations"
        className="bg-card border-border/60 shadow-e2b-soft grid gap-3 rounded-2xl border p-4 md:grid-cols-2 lg:grid-cols-4"
      >
        <div>
          <label className="text-muted-foreground mb-1 block text-xs font-semibold tracking-wide uppercase">
            N° Réservation
          </label>
          <Input
            value={refInput}
            onChange={(e) => setRefInput(e.target.value)}
            placeholder="Ex : B2B-2026-01024"
          />
        </div>
        <div>
          <label className="text-muted-foreground mb-1 block text-xs font-semibold tracking-wide uppercase">
            Statut
          </label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue placeholder="Tous" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous statuts</SelectItem>
              <SelectItem value="pending">En attente</SelectItem>
              <SelectItem value="on_option">Sur option</SelectItem>
              <SelectItem value="confirmed">Confirmée</SelectItem>
              <SelectItem value="cancelled">Annulée</SelectItem>
              <SelectItem value="completed">Soldée</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-muted-foreground mb-1 block text-xs font-semibold tracking-wide uppercase">
            Module
          </label>
          <Select value={module} onValueChange={setModule}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous modules</SelectItem>
              <SelectItem value="hotel">Hôtel</SelectItem>
              <SelectItem value="flight">Vol</SelectItem>
              <SelectItem value="omra">Omra</SelectItem>
              <SelectItem value="package">Package</SelectItem>
              <SelectItem value="activity">Activité</SelectItem>
              <SelectItem value="transfer">Transfert</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-muted-foreground mb-1 block text-xs font-semibold tracking-wide uppercase">
            Mot-clé
          </label>
          <div className="relative">
            <Search className="text-muted-foreground absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Client, service…"
              className="pl-9"
            />
          </div>
        </div>
      </section>

      <section className="bg-card border-border/60 shadow-e2b-soft overflow-hidden rounded-2xl border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="font-semibold">Référence</TableHead>
              <TableHead className="font-semibold">Client</TableHead>
              <TableHead className="font-semibold">Service</TableHead>
              <TableHead className="font-semibold">Période</TableHead>
              <TableHead className="font-semibold">Statut</TableHead>
              <TableHead className="text-right font-semibold">Vente</TableHead>
              <TableHead className="text-center font-semibold">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-muted-foreground py-12 text-center"
                >
                  Aucune réservation pour ces filtres.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => {
                const Mod = MODULE_META[r.module]
                const Stat = STATUS_META[r.status]
                const ModuleIcon = Mod.icon
                const StatusIcon = Stat.icon
                return (
                  <TableRow key={r.id} className="hover:bg-muted/30">
                    <TableCell className="font-mono text-xs">
                      <div className="font-semibold tabular-nums">{r.ref}</div>
                      <div className="text-muted-foreground text-[10px] uppercase">
                        {r.createdAt}
                      </div>
                    </TableCell>
                    <TableCell>{r.clientName}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5">
                        <ModuleIcon className="text-muted-foreground h-3.5 w-3.5" />
                        <span className="text-sm">{r.service}</span>
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.checkin} → {r.checkout}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "inline-flex items-center gap-1 border font-semibold",
                          Stat.className,
                        )}
                      >
                        <StatusIcon className="h-3 w-3" />
                        {Stat.label}
                      </Badge>
                      {r.optionExpiresAt ? (
                        <div className="text-muted-foreground mt-1 text-[10px]">
                          Option jusqu&apos;au {r.optionExpiresAt}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-primary text-right text-sm font-bold tabular-nums">
                      {formatTND(r.totalTnd)}
                    </TableCell>
                    <TableCell className="text-center">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                          >
                            <MoreVertical className="h-4 w-4" />
                            <span className="sr-only">Actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>
                            <Eye className="mr-1.5 h-3.5 w-3.5" />
                            Consulter
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Printer className="mr-1.5 h-3.5 w-3.5" />
                            Imprimer devis
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <FileText className="mr-1.5 h-3.5 w-3.5" />
                            Facture proforma
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive">
                            <XCircle className="mr-1.5 h-3.5 w-3.5" />
                            Annulation
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
        <div className="border-border/60 text-muted-foreground border-t px-4 py-2 text-xs">
          {filtered.length} ligne{filtered.length > 1 ? "s" : ""} affichée
          {filtered.length > 1 ? "s" : ""} (mock — sera branché sur Supabase en
          phase suivante)
        </div>
      </section>
    </div>
  )
}
