"use client"

import * as React from "react"
import { type ColumnDef } from "@tanstack/react-table"
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Building2,
  Download,
  RefreshCw,
} from "lucide-react"

import { DataTable, SortIcon } from "@/components/ui/data-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type { FinanceMovementRow } from "@/lib/admin/finance-data"

/* -------------------------------------------------------------------------- */
/* Helpers                                                                      */
/* -------------------------------------------------------------------------- */

const fmt3 = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
})

const MOVEMENT_META: Record<
  string,
  { label: string; className: string; icon: React.ElementType }
> = {
  credit: {
    label: "Recharge",
    className: "border-emerald-300 bg-emerald-100 text-emerald-800",
    icon: ArrowUpCircle,
  },
  debit: {
    label: "Débit",
    className: "border-red-300 bg-red-100 text-red-800",
    icon: ArrowDownCircle,
  },
  refund: {
    label: "Remboursement",
    className: "border-blue-300 bg-blue-100 text-blue-800",
    icon: ArrowUpCircle,
  },
  adjustment: {
    label: "Ajustement",
    className: "border-amber-300 bg-amber-100 text-amber-800",
    icon: RefreshCw,
  },
}

/* -------------------------------------------------------------------------- */
/* CSV export                                                                   */
/* -------------------------------------------------------------------------- */

function exportToCsv(rows: FinanceMovementRow[]) {
  const header = [
    "Date",
    "Agence",
    "Type",
    "Montant (TND)",
    "Solde après (TND)",
    "Référence",
    "Description",
  ].join(";")

  const lines = rows.map((r) =>
    [
      new Date(r.createdAt).toLocaleDateString("fr-FR"),
      r.agencyName,
      MOVEMENT_META[r.movementType]?.label ?? r.movementType,
      fmt3.format(r.amount).replace(/\s/g, ""),
      fmt3.format(r.balanceAfter).replace(/\s/g, ""),
      r.reference ?? "",
      (r.description ?? "").replace(/;/g, ","),
    ].join(";"),
  )

  const blob = new Blob(["\uFEFF" + [header, ...lines].join("\n")], {
    type: "text/csv;charset=utf-8;",
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `mouvements_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

/* -------------------------------------------------------------------------- */
/* Columns                                                                      */
/* -------------------------------------------------------------------------- */

const columns: ColumnDef<FinanceMovementRow>[] = [
  {
    accessorKey: "createdAt",
    header: ({ column }) => (
      <button
        type="button"
        className="inline-flex cursor-pointer items-center gap-1"
        onClick={column.getToggleSortingHandler()}
      >
        Date
        <SortIcon direction={column.getIsSorted() as "asc" | "desc" | false} />
      </button>
    ),
    cell: ({ row }) => (
      <span className="text-muted-foreground text-xs tabular-nums">
        {new Date(row.original.createdAt).toLocaleString("fr-FR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </span>
    ),
    sortingFn: "datetime",
  },
  {
    accessorKey: "agencyName",
    header: ({ column }) => (
      <button
        type="button"
        className="inline-flex cursor-pointer items-center gap-1"
        onClick={column.getToggleSortingHandler()}
      >
        Agence
        <SortIcon direction={column.getIsSorted() as "asc" | "desc" | false} />
      </button>
    ),
    cell: ({ row }) => (
      <span className="inline-flex items-center gap-1.5 text-sm">
        <Building2 className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
        {row.original.agencyName || "—"}
      </span>
    ),
  },
  {
    accessorKey: "movementType",
    header: "Type",
    cell: ({ row }) => {
      const meta = MOVEMENT_META[row.original.movementType] ?? {
        label: row.original.movementType,
        className: "border-gray-300 bg-gray-100 text-gray-700",
        icon: RefreshCw,
      }
      const Icon = meta.icon
      return (
        <Badge
          variant="outline"
          className={cn("inline-flex items-center gap-1 font-medium", meta.className)}
        >
          <Icon className="h-3 w-3" />
          {meta.label}
        </Badge>
      )
    },
  },
  {
    accessorKey: "amount",
    header: ({ column }) => (
      <button
        type="button"
        className="ml-auto inline-flex cursor-pointer items-center gap-1"
        onClick={column.getToggleSortingHandler()}
      >
        Montant
        <SortIcon direction={column.getIsSorted() as "asc" | "desc" | false} />
      </button>
    ),
    cell: ({ row }) => {
      const amount = row.original.amount
      return (
        <p
          className={cn(
            "text-right text-sm font-bold tabular-nums",
            amount >= 0 ? "text-emerald-700" : "text-red-600",
          )}
        >
          {amount >= 0 ? "+" : ""}
          {fmt3.format(amount)} DT
        </p>
      )
    },
  },
  {
    accessorKey: "balanceAfter",
    header: "Solde après",
    cell: ({ row }) => (
      <p className="text-muted-foreground text-right text-xs tabular-nums">
        {fmt3.format(row.original.balanceAfter)} DT
      </p>
    ),
  },
  {
    accessorKey: "reference",
    header: "Référence",
    cell: ({ row }) => (
      <span className="font-mono text-xs">
        {row.original.reference ?? "—"}
      </span>
    ),
  },
  {
    accessorKey: "description",
    header: "Description",
    cell: ({ row }) => (
      <span className="text-muted-foreground max-w-[220px] truncate text-xs">
        {row.original.description ?? "—"}
      </span>
    ),
  },
]

/* -------------------------------------------------------------------------- */
/* Toolbar                                                                       */
/* -------------------------------------------------------------------------- */

function FinanceToolbar({
  data,
  typeFilter,
  onTypeFilter,
}: {
  data: FinanceMovementRow[]
  typeFilter: string
  onTypeFilter: (v: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={typeFilter} onValueChange={onTypeFilter}>
        <SelectTrigger className="h-8 w-40 text-xs">
          <SelectValue placeholder="Tous types" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tous types</SelectItem>
          <SelectItem value="credit">Recharge</SelectItem>
          <SelectItem value="debit">Débit</SelectItem>
          <SelectItem value="refund">Remboursement</SelectItem>
          <SelectItem value="adjustment">Ajustement</SelectItem>
        </SelectContent>
      </Select>

      <Button
        size="sm"
        variant="outline"
        className="h-8 text-xs"
        onClick={() => exportToCsv(data)}
      >
        <Download className="mr-1.5 h-3.5 w-3.5" />
        Export CSV
      </Button>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Main                                                                          */
/* -------------------------------------------------------------------------- */

export function FinanceDataTable({ data }: { data: FinanceMovementRow[] }) {
  const [typeFilter, setTypeFilter] = React.useState("all")

  const filtered = React.useMemo(
    () =>
      typeFilter === "all"
        ? data
        : data.filter((r) => r.movementType === typeFilter),
    [data, typeFilter],
  )

  return (
    <DataTable
      columns={columns}
      data={filtered}
      searchColumn="agencyName"
      searchPlaceholder="Rechercher une agence, une référence…"
      defaultPageSize={25}
      toolbar={
        <FinanceToolbar
          data={filtered}
          typeFilter={typeFilter}
          onTypeFilter={setTypeFilter}
        />
      }
    />
  )
}
