"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { type ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import {
  Building2,
  Car,
  CheckCircle,
  CircleDot,
  Clock,
  Download,
  Eye,
  FileText,
  Loader2,
  Moon,
  MoreVertical,
  Plane,
  Printer,
  Sun,
  TimerReset,
  XCircle,
} from "lucide-react"

import { DataTable } from "@/components/ui/data-table"
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
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
import { cancelHotelReservation } from "@/lib/booking/cancel-actions"

const CANCELLABLE_STATUSES = new Set(["confirmed", "pending", "on_request"])

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
/* Actions (annulation + voucher réels — le reste reste desactivé/à venir)     */
/* -------------------------------------------------------------------------- */

function ReservationActionsCell({
  reservation,
}: {
  reservation: PartnerReservationRow
}) {
  const router = useRouter()
  const [isPending, startTransition] = React.useTransition()
  const [confirmOpen, setConfirmOpen] = React.useState(false)

  const canCancel =
    reservation.module === "hotel" &&
    CANCELLABLE_STATUSES.has(reservation.status)

  function handleConfirmCancel() {
    startTransition(async () => {
      const result = await cancelHotelReservation(reservation.id)
      setConfirmOpen(false)
      if (result.ok) {
        toast.success(
          result.refundedTnd > 0
            ? `Réservation annulée — ${formatTND(result.refundedTnd)} remboursé sur le wallet.`
            : "Réservation annulée (frais d'annulation myGo = montant total, aucun remboursement).",
        )
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={isPending}>
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MoreVertical className="h-4 w-4" />
            )}
            <span className="sr-only">Actions</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/pro/reservations/${reservation.id}`}>
              <Eye className="mr-1.5 h-3.5 w-3.5" />
              Consulter
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem disabled title="Pas encore disponible">
            <Printer className="mr-1.5 h-3.5 w-3.5" />
            Imprimer devis
          </DropdownMenuItem>
          <DropdownMenuItem disabled title="Pas encore disponible">
            <FileText className="mr-1.5 h-3.5 w-3.5" />
            Facture proforma
          </DropdownMenuItem>
          {reservation.module === "hotel" && (
            <DropdownMenuItem asChild>
              <a
                href={`/api/pro/reservations/${reservation.id}/voucher`}
                download
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Télécharger le voucher
              </a>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            disabled={!canCancel}
            onSelect={(e) => {
              e.preventDefault()
              setConfirmOpen(true)
            }}
          >
            <XCircle className="mr-1.5 h-3.5 w-3.5" />
            Annulation
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Annuler la réservation {reservation.publicRef} ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              L&apos;annulation sera transmise immédiatement à myGo. Des frais
              d&apos;annulation peuvent s&apos;appliquer selon la politique de
              l&apos;hôtel ; le solde restant (montant payé moins frais
              éventuels) sera automatiquement recrédité sur le wallet de
              l&apos;agence. Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Retour</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleConfirmCancel()
              }}
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Annulation en cours...
                </>
              ) : (
                "Confirmer l'annulation"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* Columns                                                                      */
/* -------------------------------------------------------------------------- */

const columns: ColumnDef<PartnerReservationRow>[] = [
  {
    accessorKey: "publicRef",
    header: "Référence",
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
    header: "Client",
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
    header: () => <span className="ml-auto">Vente</span>,
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
    cell: ({ row }) => (
      <div className="flex justify-center">
        <ReservationActionsCell reservation={row.original} />
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
