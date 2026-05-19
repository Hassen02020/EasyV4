"use client"

import { useMemo, useState } from "react"
import {
  Download,
  FileText,
  RotateCcw,
  Eye,
  CheckCircle,
  Clock,
  XCircle,
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
import type { PartnerInvoice } from "@/lib/pro/mock-tables"

const TYPE_META: Record<
  PartnerInvoice["type"],
  { label: string; className: string }
> = {
  facture: {
    label: "Facture",
    className: "border-primary/40 bg-primary/10 text-primary",
  },
  avoir: {
    label: "Avoir",
    className: "border-accent/40 bg-accent/15 text-accent-foreground",
  },
  proforma: {
    label: "Proforma",
    className: "border-secondary/40 bg-secondary/10 text-secondary",
  },
}

const STATUS_META: Record<
  PartnerInvoice["status"],
  { label: string; className: string; icon: typeof CheckCircle }
> = {
  paid: {
    label: "Payée",
    className: "border-emerald-300 bg-emerald-100 text-emerald-900",
    icon: CheckCircle,
  },
  partial: {
    label: "Partielle",
    className: "border-amber-300 bg-amber-100 text-amber-900",
    icon: Clock,
  },
  unpaid: {
    label: "Impayée",
    className: "border-red-300 bg-red-100 text-red-900",
    icon: XCircle,
  },
}

interface InvoicesTableProps {
  rows: PartnerInvoice[]
}

export function InvoicesTable({ rows }: InvoicesTableProps) {
  const [refQ, setRefQ] = useState("")
  const [type, setType] = useState<string>("all")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")

  const filtered = useMemo(() => {
    const q = refQ.trim().toLowerCase()
    return rows.filter((r) => {
      if (q && !r.ref.toLowerCase().includes(q)) return false
      if (type !== "all" && r.type !== type) return false
      if (from && r.validatedAt < from) return false
      if (to && r.validatedAt > to) return false
      return true
    })
  }, [rows, refQ, type, from, to])

  return (
    <div className="space-y-4">
      <section
        aria-label="Filtres factures"
        className="bg-card border-border/60 shadow-e2b-soft grid gap-3 rounded-2xl border p-4 md:grid-cols-2 lg:grid-cols-4"
      >
        <div>
          <label className="text-muted-foreground mb-1 block text-xs font-semibold tracking-wide uppercase">
            N° Facture
          </label>
          <Input
            value={refQ}
            onChange={(e) => setRefQ(e.target.value)}
            placeholder="Ex : FA-2026-02048"
          />
        </div>
        <div>
          <label className="text-muted-foreground mb-1 block text-xs font-semibold tracking-wide uppercase">
            Type
          </label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous</SelectItem>
              <SelectItem value="facture">Facture</SelectItem>
              <SelectItem value="avoir">Avoir</SelectItem>
              <SelectItem value="proforma">Proforma</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-muted-foreground mb-1 block text-xs font-semibold tracking-wide uppercase">
            Du
          </label>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div>
          <label className="text-muted-foreground mb-1 block text-xs font-semibold tracking-wide uppercase">
            Au
          </label>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
      </section>

      <section className="bg-card border-border/60 shadow-e2b-soft overflow-hidden rounded-2xl border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="font-semibold">N° Facture</TableHead>
              <TableHead className="font-semibold">Type</TableHead>
              <TableHead className="font-semibold">Validation</TableHead>
              <TableHead className="text-right font-semibold">
                Total HT
              </TableHead>
              <TableHead className="text-right font-semibold">TVA</TableHead>
              <TableHead className="text-right font-semibold">
                Total vente
              </TableHead>
              <TableHead className="text-right font-semibold">Payé</TableHead>
              <TableHead className="font-semibold">Statut</TableHead>
              <TableHead className="text-center font-semibold">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="text-muted-foreground py-12 text-center"
                >
                  Aucune facture trouvée.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((inv) => {
                const Type = TYPE_META[inv.type]
                const Status = STATUS_META[inv.status]
                const StatusIcon = Status.icon
                return (
                  <TableRow key={inv.id} className="hover:bg-muted/30">
                    <TableCell className="font-mono text-xs font-semibold tabular-nums">
                      {inv.ref}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn("border font-semibold", Type.className)}
                      >
                        {Type.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">
                      {inv.validatedAt}
                    </TableCell>
                    <TableCell className="text-foreground/80 text-right text-sm tabular-nums">
                      {formatTND(inv.totalHT)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-right text-xs tabular-nums">
                      {formatTND(inv.totalTVA)}
                    </TableCell>
                    <TableCell className="text-primary text-right text-sm font-bold tabular-nums">
                      {formatTND(inv.totalSales)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatTND(inv.paidAmount)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "inline-flex items-center gap-1 border font-semibold",
                          Status.className,
                        )}
                      >
                        <StatusIcon className="h-3 w-3" />
                        {Status.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 rounded-lg"
                          >
                            <FileText className="mr-1 h-3.5 w-3.5" />
                            Actions
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>
                            <Eye className="mr-1.5 h-3.5 w-3.5" />
                            Consulter
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Download className="mr-1.5 h-3.5 w-3.5" />
                            Télécharger PDF
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                            Générer un avoir
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
          {filtered.length} facture{filtered.length > 1 ? "s" : ""} affichée
          {filtered.length > 1 ? "s" : ""}
        </div>
      </section>
    </div>
  )
}
