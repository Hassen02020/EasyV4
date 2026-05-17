"use client"

import { useMemo, useState } from "react"
import { Building2, Wallet, CreditCard, Banknote, Coins } from "lucide-react"

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
  transfer: { label: "Virement", icon: Building2 },
  card: { label: "Carte bancaire", icon: CreditCard },
  cash: { label: "Espèces", icon: Coins },
  check: { label: "Chèque", icon: Banknote },
  credit_account: { label: "Compte de dépôt", icon: Wallet },
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
          <label className="text-muted-foreground mb-1 block text-xs font-semibold uppercase tracking-wide">
            Du
          </label>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div>
          <label className="text-muted-foreground mb-1 block text-xs font-semibold uppercase tracking-wide">
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
              <TableHead className="font-semibold">Échéance</TableHead>
              <TableHead className="font-semibold">Émission</TableHead>
              <TableHead className="text-right font-semibold">Montant origine</TableHead>
              <TableHead className="text-right font-semibold">Restant</TableHead>
              <TableHead className="text-right font-semibold">Crédit</TableHead>
              <TableHead className="font-semibold">Facture</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="text-muted-foreground py-12 text-center"
                >
                  Aucun règlement sur cette période.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((p) => {
                const Mode = MODE_META[p.mode]
                const ModeIcon = Mode.icon
                return (
                  <TableRow key={p.id} className="hover:bg-muted/30">
                    <TableCell className="text-xs tabular-nums">
                      {p.date}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="inline-flex items-center gap-1">
                        <ModeIcon className="h-3 w-3" />
                        {Mode.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">
                      {p.dueDate}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">
                      {p.emissionDate}
                    </TableCell>
                    <TableCell className="text-foreground text-right text-sm tabular-nums">
                      {formatTND(p.originalAmount)}
                    </TableCell>
                    <TableCell
                      className={`text-right text-sm tabular-nums ${p.remainingAmount > 0 ? "text-destructive font-bold" : "text-muted-foreground"}`}
                    >
                      {formatTND(p.remainingAmount)}
                    </TableCell>
                    <TableCell
                      className={`text-right text-sm tabular-nums ${p.credit > 0 ? "font-bold text-emerald-600" : "text-muted-foreground"}`}
                    >
                      {p.credit > 0 ? formatTND(p.credit) : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {p.invoiceRef ?? "—"}
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
