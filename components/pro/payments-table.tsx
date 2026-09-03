"use client"

import { useMemo, useState } from "react"

import { Building2, Wallet, CreditCard, Banknote, Coins, Send } from "lucide-react"

import { Input } from "@/components/ui/input"

import { Badge } from "@/components/ui/badge"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import { formatTND } from "@/lib/pro/format"

import type { PartnerPayment } from "@/lib/pro/mock-tables"

const MODE_META: Record<
  PartnerPayment["mode"],
  { label: string; icon: typeof Wallet }
> = {
  cash: { label: "Espèces", icon: Coins },

  bank_transfer: { label: "Virement bancaire", icon: Building2 },

  postal_transfer: { label: "Virement postal", icon: Send },

  postal_mandate: { label: "Mandat postal", icon: Send },

  check: { label: "Chèque", icon: Banknote },

  card_international: { label: "Carte internationale", icon: CreditCard },
}

const STATUS_META: Record<
  PartnerPayment["status"],
  { label: string; className: string }
> = {
  pending: {
    label: "En attente",
    className: "bg-amber-100 text-amber-800 border-amber-200",
  },
  validated: {
    label: "Validé",
    className: "bg-emerald-100 text-emerald-800 border-emerald-200",
  },
  rejected: {
    label: "Refusé",
    className: "bg-destructive/10 text-destructive border-destructive/20",
  },
}

interface PaymentsTableProps {
  rows: PartnerPayment[]
}

export function PaymentsTable({ rows }: PaymentsTableProps) {
  const [from, setFrom] = useState("")

  const [to, setTo] = useState("")

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (from && r.date < from) return false

      if (to && r.date > to) return false

      return true
    })
  }, [rows, from, to])

  return (
    <div className="space-y-4">
      <section
        aria-label="Période de règlements"
        className="bg-card border-border/60 shadow-e2b-soft grid gap-3 rounded-2xl border p-4 md:grid-cols-2"
      >
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
              <TableHead className="font-semibold">Date</TableHead>

              <TableHead className="font-semibold">Mode</TableHead>

              <TableHead className="font-semibold">Référence</TableHead>

              <TableHead className="text-right font-semibold">
                Montant
              </TableHead>

              <TableHead className="font-semibold">Statut</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-muted-foreground py-12 text-center"
                >
                  Aucun règlement sur cette période.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((p) => {
                const Mode = MODE_META[p.mode]

                const ModeIcon = Mode.icon

                const Status = STATUS_META[p.status]

                return (
                  <TableRow key={p.id} className="hover:bg-muted/30">
                    <TableCell className="text-xs tabular-nums">
                      {p.date}
                    </TableCell>

                    <TableCell>
                      <Badge
                        variant="outline"
                        className="inline-flex items-center gap-1"
                      >
                        <ModeIcon className="h-3 w-3" />

                        {Mode.label}
                      </Badge>
                    </TableCell>

                    <TableCell className="font-mono text-xs">
                      {p.reference ?? "—"}
                    </TableCell>

                    <TableCell className="text-foreground text-right text-sm tabular-nums">
                      {formatTND(p.amount)}
                    </TableCell>

                    <TableCell>
                      <Badge variant="outline" className={Status.className}>
                        {Status.label}
                      </Badge>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>

        <div className="border-border/60 text-muted-foreground border-t px-4 py-2 text-xs">
          {filtered.length} règlement{filtered.length > 1 ? "s" : ""}
        </div>
      </section>
    </div>
  )
}
