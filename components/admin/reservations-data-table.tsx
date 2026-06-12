"use client"

/**
 * Data Table interactive du Back-Office Easy2Book.
 *
 * Fonctionnalités :
 *  - Filtrage : recherche texte (référence / nom client / email), filtre
 *    par statut, filtre par module métier.
 *  - Tri : colonnes Référence, Client, Module, Montant, Date.
 *  - Pagination client (10 lignes / page).
 *  - Mutation : changement de statut via Server Action
 *    `updateReservationStatus` (transitions validées en serveur).
 *  - Realtime : souscription Supabase sur `reservations`. À chaque
 *    INSERT/UPDATE/DELETE, on appelle `router.refresh()` qui re-fetch les
 *    Server Components et propage la nouvelle donnée sans rechargement
 *    complet.
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Building2,
  Car,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  Moon,
  Plane,
  Search,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { updateReservationStatus } from "@/lib/admin/actions"
import {
  getAllowedTransitions,
  type ReservationStatus,
} from "@/lib/admin/reservation-status"
import type { AdminReservationRow } from "@/lib/admin/reservations-data"
import { useRealtimeTable } from "@/lib/supabase/use-realtime-table"

const MODULE_LABEL: Record<string, { label: string; icon: typeof Building2 }> =
  {
    hotel: { label: "Hôtels Tunisie", icon: Building2 },
    flight: { label: "Vols", icon: Plane },
    omra: { label: "Omra", icon: Moon },
    package: { label: "Voyages organisés", icon: Plane },
    activity: { label: "Activités", icon: Plane },
    transfer: { label: "Transferts", icon: Car },
  }

const STATUS_LABEL: Record<
  string,
  { label: string; className: string; icon: typeof CheckCircle }
> = {
  pending: {
    label: "En attente",
    className:
      "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
    icon: Clock,
  },
  on_request: {
    label: "Sur demande",
    className:
      "border-sky-300 bg-sky-100 text-sky-900 dark:border-sky-700 dark:bg-sky-900/40 dark:text-sky-200",
    icon: Clock,
  },
  confirmed: {
    label: "Confirmée",
    className:
      "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200",
    icon: CheckCircle,
  },
  cancelled: {
    label: "Annulée",
    className:
      "border-red-300 bg-red-100 text-red-900 dark:border-red-700 dark:bg-red-900/40 dark:text-red-200",
    icon: XCircle,
  },
  no_show: {
    label: "No-show",
    className:
      "border-slate-300 bg-slate-100 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200",
    icon: XCircle,
  },
  completed: {
    label: "Terminée",
    className:
      "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
    icon: CheckCircle,
  },
  refunded: {
    label: "Remboursée",
    className:
      "border-purple-300 bg-purple-100 text-purple-900 dark:border-purple-700 dark:bg-purple-900/40 dark:text-purple-200",
    icon: XCircle,
  },
}

const ALL_STATUSES: ReservationStatus[] = [
  "pending",
  "on_request",
  "confirmed",
  "cancelled",
  "no_show",
  "completed",
  "refunded",
]

const TND_FORMAT = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 0,
})

type SortKey =
  | "publicRef"
  | "customerName"
  | "module"
  | "tndAmount"
  | "createdAt"
type SortDir = "asc" | "desc"

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) {
    return <ArrowUpDown className="text-muted-foreground ml-1 size-3" />
  }
  return dir === "asc" ? (
    <ArrowUp className="text-foreground ml-1 size-3" />
  ) : (
    <ArrowDown className="text-foreground ml-1 size-3" />
  )
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d)
}

function ModuleBadge({ module }: { module: string }) {
  const meta = MODULE_LABEL[module] ?? {
    label: module,
    icon: Building2,
  }
  const Icon = meta.icon
  return (
    <Badge variant="outline" className="gap-1 font-normal">
      <Icon className="size-3" />
      {meta.label}
    </Badge>
  )
}

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_LABEL[status] ?? {
    label: status,
    className: "border-slate-300 bg-slate-100 text-slate-900",
    icon: Clock,
  }
  const Icon = meta.icon
  return (
    <Badge variant="outline" className={`gap-1 font-medium ${meta.className}`}>
      <Icon className="size-3" />
      {meta.label}
    </Badge>
  )
}

export function ReservationsDataTable({
  rows,
  nextCursor,
  hasMore,
  showAgencyColumn = false,
}: {
  rows: AdminReservationRow[]
  nextCursor?: string | null
  hasMore?: boolean
  showAgencyColumn?: boolean
}) {
  const router = useRouter()
  const [search, setSearch] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState<string>("all")
  const [moduleFilter, setModuleFilter] = React.useState<string>("all")
  const [sortKey, setSortKey] = React.useState<SortKey>("createdAt")
  const [sortDir, setSortDir] = React.useState<SortDir>("desc")
  const [page, setPage] = React.useState(0)
  const [pendingId, setPendingId] = React.useState<string | null>(null)

  const pageSize = 10

  useRealtimeTable("reservations", (event) => {
    router.refresh()
    if (event.type === "INSERT") {
      const ref = (event.newRow?.public_ref as string | undefined) ?? ""
      toast.success(
        ref
          ? `Nouvelle réservation ${ref}`
          : "Une nouvelle réservation vient d'arriver",
      )
    }
  })

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false
      if (moduleFilter !== "all" && row.module !== moduleFilter) return false
      if (!q) return true
      return (
        row.publicRef.toLowerCase().includes(q) ||
        row.customerName.toLowerCase().includes(q) ||
        (row.customerEmail ?? "").toLowerCase().includes(q) ||
        (row.customerPhone ?? "").toLowerCase().includes(q)
      )
    })
  }, [rows, search, statusFilter, moduleFilter])

  const sorted = React.useMemo(() => {
    const arr = [...filtered]
    arr.sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case "publicRef":
          cmp = a.publicRef.localeCompare(b.publicRef)
          break
        case "customerName":
          cmp = a.customerName.localeCompare(b.customerName)
          break
        case "module":
          cmp = a.module.localeCompare(b.module)
          break
        case "tndAmount":
          cmp = a.tndAmount - b.tndAmount
          break
        case "createdAt":
          cmp = a.createdAt.localeCompare(b.createdAt)
          break
      }
      return sortDir === "asc" ? cmp : -cmp
    })
    return arr
  }, [filtered, sortKey, sortDir])

  // Reset de la page courante quand un filtre / tri change.
  // Idiome React "ajuster un state pendant le render" : on stocke la clé
  // précédente dans un state et on se re-render immédiatement si elle change.
  const filtersKey = `${search}|${statusFilter}|${moduleFilter}|${sortKey}|${sortDir}`
  const [lastFiltersKey, setLastFiltersKey] = React.useState(filtersKey)
  if (lastFiltersKey !== filtersKey) {
    setLastFiltersKey(filtersKey)
    if (page !== 0) setPage(0)
  }

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, totalPages - 1)
  const pageRows = sorted.slice(
    safePage * pageSize,
    safePage * pageSize + pageSize,
  )

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc")
    } else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  async function handleStatusChange(
    row: AdminReservationRow,
    next: ReservationStatus,
  ) {
    if (next === row.status) return
    setPendingId(row.id)
    const result = await updateReservationStatus({
      reservationId: row.id,
      nextStatus: next,
    })
    setPendingId(null)
    if (!result.ok) {
      toast.error(`Échec : ${result.error}`)
      return
    }
    const labelNext = STATUS_LABEL[next]?.label ?? next
    toast.success(`${row.publicRef} → ${labelNext}`)
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <div className="relative">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            placeholder="Rechercher (référence, nom, email, téléphone)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            aria-label="Rechercher une réservation"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger
            className="w-full sm:w-44"
            aria-label="Filtrer par statut"
          >
            <SelectValue placeholder="Tous statuts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous statuts</SelectItem>
            {ALL_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABEL[s]?.label ?? s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={moduleFilter} onValueChange={setModuleFilter}>
          <SelectTrigger
            className="w-full sm:w-48"
            aria-label="Filtrer par module"
          >
            <SelectValue placeholder="Tous modules" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous modules</SelectItem>
            {Object.entries(MODULE_LABEL).map(([key, meta]) => (
              <SelectItem key={key} value={key}>
                {meta.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="border-border/60 bg-card shadow-e2b-soft overflow-hidden rounded-2xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <button
                  type="button"
                  className="flex items-center"
                  onClick={() => toggleSort("publicRef")}
                >
                  Référence
                  <SortIcon active={sortKey === "publicRef"} dir={sortDir} />
                </button>
              </TableHead>
              {showAgencyColumn ? (
                <TableHead>
                  <button
                    type="button"
                    className="flex items-center"
                    onClick={() => toggleSort("customerName")}
                  >
                    Agence
                    <SortIcon active={false} dir={sortDir} />
                  </button>
                </TableHead>
              ) : null}
              <TableHead>
                <button
                  type="button"
                  className="flex items-center"
                  onClick={() => toggleSort("customerName")}
                >
                  Client
                  <SortIcon active={sortKey === "customerName"} dir={sortDir} />
                </button>
              </TableHead>
              <TableHead>
                <button
                  type="button"
                  className="flex items-center"
                  onClick={() => toggleSort("module")}
                >
                  Module
                  <SortIcon active={sortKey === "module"} dir={sortDir} />
                </button>
              </TableHead>
              <TableHead className="text-right">
                <button
                  type="button"
                  className="ml-auto flex items-center"
                  onClick={() => toggleSort("tndAmount")}
                >
                  Montant
                  <SortIcon active={sortKey === "tndAmount"} dir={sortDir} />
                </button>
              </TableHead>
              <TableHead>
                <button
                  type="button"
                  className="flex items-center"
                  onClick={() => toggleSort("createdAt")}
                >
                  Date
                  <SortIcon active={sortKey === "createdAt"} dir={sortDir} />
                </button>
              </TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="w-48 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-muted-foreground py-12 text-center text-sm"
                >
                  Aucune réservation ne correspond aux filtres.
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((row) => (
                <TableRow key={row.id} data-testid={`row-${row.publicRef}`}>
                  <TableCell className="font-mono text-xs">
                    {row.publicRef}
                  </TableCell>
                  {showAgencyColumn ? (
                    <TableCell>
                      <span className="inline-flex items-center gap-1 text-xs">
                        <Building2 className="text-muted-foreground size-3 shrink-0" />
                        {row.agencyName ?? "—"}
                      </span>
                    </TableCell>
                  ) : null}
                  <TableCell>
                    <div className="font-medium">{row.customerName}</div>
                    {row.customerEmail ? (
                      <div className="text-muted-foreground text-xs">
                        {row.customerEmail}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <ModuleBadge module={row.module} />
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {TND_FORMAT.format(row.tndAmount)} TND
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {formatDate(row.createdAt)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Select
                      value=""
                      onValueChange={(next) =>
                        void handleStatusChange(row, next as ReservationStatus)
                      }
                      disabled={pendingId === row.id}
                    >
                      <SelectTrigger
                        size="sm"
                        className="ml-auto w-40"
                        aria-label={`Changer le statut de ${row.publicRef}`}
                      >
                        {pendingId === row.id ? (
                          <span className="flex items-center gap-2">
                            <Loader2 className="size-3 animate-spin" />
                            Mise à jour…
                          </span>
                        ) : (
                          <SelectValue placeholder="Changer statut…" />
                        )}
                      </SelectTrigger>
                      <SelectContent>
                        {getAllowedTransitions(
                          row.status as ReservationStatus,
                        ).map((s) => (
                          <SelectItem key={s} value={s}>
                            {STATUS_LABEL[s]?.label ?? s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="text-muted-foreground flex flex-col items-start justify-between gap-4 text-sm sm:flex-row sm:items-center">
        <div>
          {sorted.length} résultat{sorted.length > 1 ? "s" : ""} affiché
          {sorted.length > 1 ? "s" : ""} sur cette page
          {hasMore ? " · Données paginées côté serveur" : ""}
        </div>
        <div className="flex items-center gap-3">
          {/* Client-side pagination within current server page */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(Math.max(0, safePage - 1))}
              disabled={safePage === 0}
              aria-label="Page précédente"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-xs">
              {safePage + 1} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(Math.min(totalPages - 1, safePage + 1))}
              disabled={safePage >= totalPages - 1}
              aria-label="Page suivante"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>

          {/* Server-side cursor navigation */}
          {hasMore && nextCursor ? (
            <Button
              variant="default"
              size="sm"
              onClick={() =>
                router.push(
                  `/admin/reservations?cursor=${encodeURIComponent(nextCursor)}`,
                )
              }
              aria-label="Page serveur suivante"
            >
              Suite
              <ChevronRight className="ml-1 size-4" />
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
