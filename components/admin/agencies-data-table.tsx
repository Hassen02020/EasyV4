"use client"

import * as React from "react"
import { type ColumnDef } from "@tanstack/react-table"
import {
  Building2,
  CheckCircle2,
  MoreHorizontal,
  PauseCircle,
  PlayCircle,
  Users,
  Wallet,
} from "lucide-react"
import { toast } from "sonner"

import { DataTable, SortIcon } from "@/components/ui/data-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  setAgencyStatus,
  adminRechargeWallet,
} from "@/lib/admin/agencies-actions"

/* -------------------------------------------------------------------------- */
/* Types                                                                        */
/* -------------------------------------------------------------------------- */

export interface AgencyRow {
  id: string
  name: string
  brandName: string | null
  slug: string
  agencyType: string
  contactEmail: string | null
  contactPhone: string | null
  depositBalance: number
  creditLowThreshold: number
  status: string
  userCount: number
  createdAt: Date | string
}

/* -------------------------------------------------------------------------- */
/* Configs statut                                                               */
/* -------------------------------------------------------------------------- */

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  active: { label: "Active", variant: "default" },
  suspended: { label: "Suspendue", variant: "destructive" },
  pending: { label: "En attente", variant: "secondary" },
}

const TYPE_LABEL: Record<string, string> = {
  ota: "OTA",
  partner: "Partenaire B2B",
}

/* -------------------------------------------------------------------------- */
/* Dialog recharge                                                              */
/* -------------------------------------------------------------------------- */

function RechargeDialog({
  agency,
  open,
  onClose,
}: {
  agency: AgencyRow
  open: boolean
  onClose: () => void
}) {
  const [amount, setAmount] = React.useState("")
  const [note, setNote] = React.useState("")
  const [loading, setLoading] = React.useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const parsed = parseFloat(amount)
    if (!parsed || parsed <= 0) {
      toast.error("Montant invalide")
      return
    }
    setLoading(true)
    try {
      const res = await adminRechargeWallet(agency.id, parsed, note || undefined)
      if (res.ok) {
        toast.success(
          `${parsed.toLocaleString("fr-FR")} DT rechargés sur ${agency.brandName ?? agency.name}`,
        )
        setAmount("")
        setNote("")
        onClose()
      } else {
        toast.error(res.error)
      }
    } catch {
      toast.error("Erreur réseau — réessayez")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-blue-600" />
            Recharger le solde
          </DialogTitle>
          <DialogDescription>
            Agence :{" "}
            <span className="font-semibold">
              {agency.brandName ?? agency.name}
            </span>
            {" — "}solde actuel :{" "}
            <span className="font-semibold">
              {agency.depositBalance.toLocaleString("fr-FR")} DT
            </span>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="recharge-amount">Montant (DT)</Label>
            <Input
              id="recharge-amount"
              type="number"
              min="1"
              max="999999"
              step="0.001"
              placeholder="Ex. 500"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="recharge-note">Note interne (optionnel)</Label>
            <Input
              id="recharge-note"
              placeholder="Ex. Virement reçu le 12/06/2026"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Traitement…" : "Confirmer la recharge"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/* -------------------------------------------------------------------------- */
/* Colonnes                                                                     */
/* -------------------------------------------------------------------------- */

function buildColumns(
  onRecharge: (agency: AgencyRow) => void,
  onToggleStatus: (agency: AgencyRow) => void,
): ColumnDef<AgencyRow>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <button
          type="button"
          className="inline-flex cursor-pointer items-center"
          onClick={column.getToggleSortingHandler()}
        >
          Agence
          <SortIcon direction={column.getIsSorted() as "asc" | "desc" | false} />
        </button>
      ),
      cell: ({ row }) => {
        const agency = row.original
        const initials = (agency.brandName ?? agency.name).charAt(0).toUpperCase()
        return (
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-xs font-bold text-blue-700">
              {initials}
            </div>
            <div>
              <p className="font-medium">
                {agency.brandName ?? agency.name}
              </p>
              <p className="text-muted-foreground text-xs">{agency.slug}</p>
            </div>
          </div>
        )
      },
    },
    {
      accessorKey: "agencyType",
      header: "Type",
      cell: ({ row }) => (
        <Badge
          variant={row.original.agencyType === "ota" ? "default" : "secondary"}
        >
          {TYPE_LABEL[row.original.agencyType] ?? row.original.agencyType}
        </Badge>
      ),
      filterFn: "equals",
    },
    {
      accessorKey: "userCount",
      header: ({ column }) => (
        <button
          type="button"
          className="inline-flex cursor-pointer items-center"
          onClick={column.getToggleSortingHandler()}
        >
          <Users className="mr-1 h-3.5 w-3.5" />
          Utilisateurs
          <SortIcon direction={column.getIsSorted() as "asc" | "desc" | false} />
        </button>
      ),
      cell: ({ row }) => (
        <span className="tabular-nums">{row.original.userCount}</span>
      ),
    },
    {
      accessorKey: "depositBalance",
      header: ({ column }) => (
        <button
          type="button"
          className="inline-flex cursor-pointer items-center"
          onClick={column.getToggleSortingHandler()}
        >
          Solde Wallet
          <SortIcon direction={column.getIsSorted() as "asc" | "desc" | false} />
        </button>
      ),
      cell: ({ row }) => {
        const a = row.original
        if (a.agencyType !== "partner")
          return <span className="text-muted-foreground">—</span>
        const pct = Math.min(
          100,
          (a.depositBalance / Math.max(a.creditLowThreshold * 2, 1)) * 100,
        )
        const isLow = a.depositBalance <= a.creditLowThreshold
        return (
          <div className="w-36">
            <span
              className={`text-xs tabular-nums ${isLow ? "font-medium text-red-600" : ""}`}
            >
              {a.depositBalance.toLocaleString("fr-FR", {
                minimumFractionDigits: 3,
              })}{" "}
              DT
            </span>
            <Progress
              value={pct}
              className={`mt-1 h-1 ${isLow ? "[&>div]:bg-red-500" : ""}`}
            />
          </div>
        )
      },
    },
    {
      accessorKey: "status",
      header: "Statut",
      cell: ({ row }) => {
        const cfg = STATUS_CONFIG[row.original.status] ?? {
          label: row.original.status,
          variant: "outline" as const,
        }
        return <Badge variant={cfg.variant}>{cfg.label}</Badge>
      },
    },
    {
      accessorKey: "contactEmail",
      header: "Contact",
      cell: ({ row }) => (
        <span className="text-muted-foreground text-xs">
          {row.original.contactEmail ?? "—"}
        </span>
      ),
    },
    {
      id: "actions",
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => {
        const agency = row.original
        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">Actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {agency.agencyType === "partner" && (
                  <DropdownMenuItem onClick={() => onRecharge(agency)}>
                    <Wallet className="mr-2 h-4 w-4 text-blue-600" />
                    Recharger le solde
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                {agency.status === "active" ? (
                  <DropdownMenuItem
                    onClick={() => onToggleStatus(agency)}
                    className="text-red-600 focus:text-red-600"
                  >
                    <PauseCircle className="mr-2 h-4 w-4" />
                    Suspendre
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onClick={() => onToggleStatus(agency)}
                    className="text-green-600 focus:text-green-600"
                  >
                    <PlayCircle className="mr-2 h-4 w-4" />
                    Activer
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      },
    },
  ]
}

/* -------------------------------------------------------------------------- */
/* Toolbar : filtre par type                                                    */
/* -------------------------------------------------------------------------- */

function AgencyTypeFilter({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const options = [
    { value: "all", label: "Tous types" },
    { value: "ota", label: "OTA" },
    { value: "partner", label: "Partenaire B2B" },
  ]
  return (
    <div className="flex gap-1">
      {options.map((o) => (
        <Button
          key={o.value}
          type="button"
          size="sm"
          variant={value === o.value ? "default" : "outline"}
          onClick={() => onChange(o.value)}
          className="h-8 text-xs"
        >
          {o.label}
        </Button>
      ))}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Composant principal                                                          */
/* -------------------------------------------------------------------------- */

export function AgenciesDataTable({ data }: { data: AgencyRow[] }) {
  const [rechargeTarget, setRechargeTarget] =
    React.useState<AgencyRow | null>(null)
  const [typeFilter, setTypeFilter] = React.useState("all")

  const filteredData = React.useMemo(
    () =>
      typeFilter === "all"
        ? data
        : data.filter((a) => a.agencyType === typeFilter),
    [data, typeFilter],
  )

  async function handleToggleStatus(agency: AgencyRow) {
    const next = agency.status === "active" ? "suspended" : "active"
    const label =
      next === "active"
        ? `Activation de ${agency.brandName ?? agency.name}…`
        : `Suspension de ${agency.brandName ?? agency.name}…`
    const toastId = toast.loading(label)
    try {
      const res = await setAgencyStatus(agency.id, next)
      if (res.ok) {
        toast.success(
          next === "active" ? "Agence activée" : "Agence suspendue",
          { id: toastId },
        )
      } else {
        toast.error(res.error, { id: toastId })
      }
    } catch {
      toast.error("Erreur réseau — réessayez", { id: toastId })
    }
  }

  const columns = React.useMemo(
    () => buildColumns(setRechargeTarget, handleToggleStatus),
    [],
  )

  return (
    <>
      <DataTable
        columns={columns}
        data={filteredData}
        searchColumn="name"
        searchPlaceholder="Rechercher une agence…"
        defaultPageSize={10}
        toolbar={
          <AgencyTypeFilter value={typeFilter} onChange={setTypeFilter} />
        }
      />

      {rechargeTarget && (
        <RechargeDialog
          agency={rechargeTarget}
          open={!!rechargeTarget}
          onClose={() => setRechargeTarget(null)}
        />
      )}
    </>
  )
}
