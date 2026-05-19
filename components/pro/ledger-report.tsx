"use client"

import { useMemo, useState } from "react"
import { Download, RefreshCcw, TrendingUp, TrendingDown } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatTND } from "@/lib/pro/format"
import type { PartnerLedgerEntry } from "@/lib/pro/mock-tables"

interface LedgerReportProps {
  rows: PartnerLedgerEntry[]
  /** Solde courant communiqué par le layout (cohérent avec le widget header). */
  currentBalance: number
}

export function LedgerReport({ rows, currentBalance }: LedgerReportProps) {
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [scope, setScope] = useState<"invoices" | "reservations">("invoices")

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (from && r.date < from) return false
      if (to && r.date > to) return false
      if (scope === "reservations" && r.type === "payment") return false
      return true
    })
  }, [rows, from, to, scope])

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, r) => {
        acc.debit += r.debit
        acc.credit += r.credit
        return acc
      },
      { debit: 0, credit: 0 },
    )
  }, [filtered])

  return (
    <div className="space-y-4">
      <section
        aria-label="Solde du compte"
        className="grid gap-3 md:grid-cols-3"
      >
        <div className="bg-primary text-primary-foreground shadow-e2b-elevated rounded-2xl p-4">
          <div className="text-xs font-semibold tracking-wide uppercase opacity-90">
            Solde compte de dépôt
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums">
            {formatTND(currentBalance)}
          </div>
          <p className="text-xs opacity-80">Cohérent avec le widget header</p>
        </div>
        <div className="bg-card border-border/60 shadow-e2b-soft rounded-2xl border p-4">
          <div className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
            <TrendingDown className="text-destructive h-3 w-3" />
            Débits période
          </div>
          <div className="text-foreground mt-1 text-2xl font-bold tabular-nums">
            {formatTND(totals.debit)}
          </div>
          <p className="text-muted-foreground text-xs">
            {filtered.filter((r) => r.debit > 0).length} ligne
            {filtered.filter((r) => r.debit > 0).length > 1 ? "s" : ""}
          </p>
        </div>
        <div className="bg-card border-border/60 shadow-e2b-soft rounded-2xl border p-4">
          <div className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
            <TrendingUp className="h-3 w-3 text-emerald-600" />
            Crédits période
          </div>
          <div className="text-foreground mt-1 text-2xl font-bold tabular-nums">
            {formatTND(totals.credit)}
          </div>
          <p className="text-muted-foreground text-xs">
            {filtered.filter((r) => r.credit > 0).length} ligne
            {filtered.filter((r) => r.credit > 0).length > 1 ? "s" : ""}
          </p>
        </div>
      </section>

      <section
        aria-label="Paramètres de rapport"
        className="bg-card border-border/60 shadow-e2b-soft rounded-2xl border p-4"
      >
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_220px_auto]">
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
          <div>
            <label className="text-muted-foreground mb-1 block text-xs font-semibold tracking-wide uppercase">
              Type
            </label>
            <div className="flex items-center gap-1.5" role="radiogroup">
              {(["invoices", "reservations"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={scope === v}
                  onClick={() => setScope(v)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                    scope === v
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/60 text-muted-foreground hover:bg-muted/50",
                  )}
                >
                  {v === "invoices" ? "Factures & avoirs" : "Réservations"}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setFrom("")
                setTo("")
              }}
              className="rounded-xl"
            >
              <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />
              Réinitialiser
            </Button>
            <Button className="rounded-xl">
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Générer un rapport
            </Button>
          </div>
        </div>
      </section>

      <section className="bg-card border-border/60 shadow-e2b-soft overflow-hidden rounded-2xl border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="font-semibold">Date</TableHead>
              <TableHead className="font-semibold">Référence</TableHead>
              <TableHead className="font-semibold">Libellé</TableHead>
              <TableHead className="font-semibold">Nature</TableHead>
              <TableHead className="text-right font-semibold">Débit</TableHead>
              <TableHead className="text-right font-semibold">Crédit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-muted-foreground py-12 text-center"
                >
                  Aucune ligne sur cette période.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow key={r.id} className="hover:bg-muted/30">
                  <TableCell className="text-xs tabular-nums">
                    {r.date}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.ref}</TableCell>
                  <TableCell className="text-sm">{r.description}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {r.type === "facture"
                        ? "Facture"
                        : r.type === "avoir"
                          ? "Avoir"
                          : r.type === "payment"
                            ? "Paiement"
                            : "Crédit"}
                    </Badge>
                  </TableCell>
                  <TableCell
                    className={`text-right text-sm tabular-nums ${r.debit > 0 ? "text-destructive font-semibold" : "text-muted-foreground"}`}
                  >
                    {r.debit > 0 ? formatTND(r.debit) : "—"}
                  </TableCell>
                  <TableCell
                    className={`text-right text-sm tabular-nums ${r.credit > 0 ? "font-semibold text-emerald-600" : "text-muted-foreground"}`}
                  >
                    {r.credit > 0 ? formatTND(r.credit) : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <div className="border-border/60 text-muted-foreground border-t px-4 py-2 text-xs">
          {filtered.length} ligne{filtered.length > 1 ? "s" : ""} · Débit total
          : {formatTND(totals.debit)} · Crédit total :{" "}
          {formatTND(totals.credit)}
        </div>
      </section>
    </div>
  )
}
