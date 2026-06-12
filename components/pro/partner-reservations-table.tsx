"use client"

import * as React from "react"
import { type ColumnDef } from "@tanstack/react-table"
import {
  Building2,
  Car,
  CheckCircle,
  CircleDot,
  Clock,
  Eye,
  FileText,
  Moon,
  MoreVertical,
  Plane,
  Printer,
  Sun,
  TimerReset,
  XCircle,
} from "lucide-react"

import { DataTable, SortIcon } from "@/components/ui/data-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { formatTND } from "@/lib/pro/format"
import type { PartnerReservationRow } from "@/lib/pro/reservations-data"

/* -------------------------------------------------------------------------- */
/* Status & module config                                                       */
/* -------------------------------------------------------------------------- */

const STATUS_META: Record<
  string,
  { label: string; className: string; icon: React.ElementType }
> = {
  pending: {
    label: "En attente",
    className: "border-amber-300 bg-amber-100 text-amber-900",
    icon: Clock,
  },
  on_request: {
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
  refunded: {
    label: "Remboursée",
    className: "border-purple-300 bg-purple-100 text-purple-900",
    icon: TimerReset,
  },
  completed: {
    label: "Soldée",
    className: "border-blue-300 bg-blue-100 text-blue-900",
    icon: CircleDot,
  },
  no_show: {
    label: "No-show",
    className: "border-gray-300 bg-gray-100 text-gray-700",
    icon: XCircle,
  },
}

const MODULE_META: Record<
  string,
  { label: string; icon: React.ElementType }
> = {
  hotel: { label: "Hôtel", icon: Building2 },
  flight: { label: "Vol", icon: Plane },
  package: { label: "Package", icon: Sun },
  activity: { label: "Activité", icon: Sun },
  omra: { label: "Omra", icon: Moon },
  transfer: { label: "Transfert", icon: Car },
}

/* -------------------------------------------------------------------------- */
/* Columns                                                                      */
/* -------------------------------------------------------------------------- */

const columns: ColumnDef<PartnerReservationRow>[] = [
  {
    accessorKey: "publicRef",
    header: ({ column }) => (
      <button
        type="button"
        className="inline-flex cursor-pointer items-center"
        onClick={column.getToggleSortingHandler()}
      >
        Référence
        <SortIcon direction={column.getIsSorted() as "asc" | "desc" | false} />
      </button>
    ),
    cell: ({ row }) => (
      <div className="font-mono">
        <p className="text-foreground text-xs font-semibold tabular-nums">
          {row.original.publicRef}
        </p>
        <p className="text-muted-foreground text-[10px]">
          {new Date(row.original.createdAt).toLocaleDateString("fr-FR")}
        </p>
      </div>
    ),
  },
  {
    accessorKey: "customerName",
    header: ({ column }) => (
      <button
        type="button"
        className="inline-flex cursor-pointer items-center"
        onClick={column.getToggleSortingHandler()}
      >
        Client
        <SortIcon direction={column.getIsSorted() as "asc" | "desc" | false} />
      </button>
    ),
    cell: ({ row }) => (
      <div>
        <p className="text-foreground text-sm font-medium">
          {row.original.customerName}
        </p>
        {row.original.customerEmail ? (
          <p className="text-muted-foreground text-[10px]">
            {row.original.customerEmail}
          </p>
        ) : null}
      </div>
    ),
  },
  {
    accessorKey: "module",
    header: "Module",
    cell: ({ row }) => {
      const meta = MODULE_META[row.original.module] ?? {
        label: row.original.module,
        icon: Sun,
      }
      const Icon = meta.icon
      return (
        <span className="inline-flex items-center gap-1.5">
          <Icon className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
          <span className="text-sm">
            {row.original.serviceName ?? meta.label}
          </span>
        </span>
      )
    },
  },
  {
    id: "period",
    header: "Période",
    cell: ({ row }) => {
      const { checkin, checkout } = row.original
      if (!checkin && !checkout)
        return <span className="text-muted-foreground text-xs">—</span>
      return (
        <span className="text-xs tabular-nums">
          {checkin ?? "—"} → {checkout ?? "—"}
        </span>
      )
    },
  },
  {
    accessorKey: "status",
    header: "Statut",
    cell: ({ row }) => {
      const meta = STATUS_META[row.original.status] ?? {
        label: row.original.status,
        className: "border-gray-300 bg-gray-100 text-gray-700",
        icon: Clock,
      }
      const Icon = meta.icon
      return (
        <Badge
          variant="outline"
          className={cn(
            "inline-flex items-center gap-1 border font-semibold",
            meta.className,
          )}
        >
          <Icon className="h-3 w-3" />
          {meta.label}
        </Badge>
      )
    },
  },
  {
    accessorKey: "tndAmount",
    header: ({ column }) => (
      <button
        type="button"
        className="ml-auto inline-flex cursor-pointer items-center"
        onClick={column.getToggleSortingHandler()}
      >
        Vente
        <SortIcon direction={column.getIsSorted() as "asc" | "desc" | false} />
      </button>
    ),
    cell: ({ row }) => (
      <p className="text-primary text-right text-sm font-bold tabular-nums">
        {formatTND(row.original.tndAmount)}
      </p>
    ),
  },
  {
    id: "actions",
    enableSorting: false,
    enableHiding: false,
    cell: ({ row: _ }) => (
      <div className="flex justify-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
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
            <DropdownMenuItem className="text-destructive focus:text-destructive">
              <XCircle className="mr-1.5 h-3.5 w-3.5" />
              Annulation
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    ),
  },
]

/* -------------------------------------------------------------------------- */
/* Toolbar filters                                                              */
/* -------------------------------------------------------------------------- */

function ReservationFilters({
  status,
  module,
  onStatus,
  onModule,
}: {
  status: string
  module: string
  onStatus: (v: string) => void
  onModule: (v: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Select value={status} onValueChange={onStatus}>
        <SelectTrigger className="h-8 w-36 text-xs">
          <SelectValue placeholder="Tous statuts" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tous statuts</SelectItem>
          <SelectItem value="pending">En attente</SelectItem>
          <SelectItem value="on_request">Sur option</SelectItem>
          <SelectItem value="confirmed">Confirmée</SelectItem>
          <SelectItem value="cancelled">Annulée</SelectItem>
          <SelectItem value="completed">Soldée</SelectItem>
        </SelectContent>
      </Select>

      <Select value={module} onValueChange={onModule}>
        <SelectTrigger className="h-8 w-36 text-xs">
          <SelectValue placeholder="Tous modules" />
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
  )
}

/* -------------------------------------------------------------------------- */
/* Main component                                                               */
/* -------------------------------------------------------------------------- */

export function PartnerReservationsTable({
  data,
}: {
  data: PartnerReservationRow[]
}) {
  const [statusFilter, setStatusFilter] = React.useState("all")
  const [moduleFilter, setModuleFilter] = React.useState("all")

  const filtered = React.useMemo(() => {
    return data.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false
      if (moduleFilter !== "all" && r.module !== moduleFilter) return false
      return true
    })
  }, [data, statusFilter, moduleFilter])

  return (
    <DataTable
      columns={columns}
      data={filtered}
      searchColumn="customerName"
      searchPlaceholder="Rechercher un client, une référence…"
      defaultPageSize={20}
      showColumnVisibility={false}
      toolbar={
        <ReservationFilters
          status={statusFilter}
          module={moduleFilter}
          onStatus={setStatusFilter}
          onModule={setModuleFilter}
        />
      }
    />
  )
}
