"use client"

import { useMemo, useState } from "react"
import {
  Search,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  type LucideIcon,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ValidationRowActions } from "@/components/admin/validation-row-actions"

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: LucideIcon }> = {
  pending: { label: "En attente", color: "bg-amber-100 text-amber-800", icon: Clock },
  pending_supplier: { label: "Attente fournisseur", color: "bg-blue-100 text-blue-800", icon: AlertCircle },
  pending_payment: { label: "Attente paiement", color: "bg-purple-100 text-purple-800", icon: Clock },
  approved: { label: "Validé", color: "bg-emerald-100 text-emerald-800", icon: CheckCircle },
  rejected: { label: "Rejeté", color: "bg-red-100 text-red-800", icon: XCircle },
  cancelled: { label: "Annulé", color: "bg-gray-100 text-gray-800", icon: XCircle },
}

export interface ValidationTableRow {
  reservation: {
    id: string
    publicRef: string
    module: string
    tndAmount: string
    createdAt: string | Date
  }
  validation: {
    status: string
    currentStep: string | null
    submittedAt: string | Date | null
  } | null
  customer: {
    firstName: string
    lastName: string
    email: string | null
  } | null
}

interface ValidationsFilterableTableProps {
  rows: ValidationTableRow[]
}

export function ValidationsFilterableTable({ rows }: ValidationsFilterableTableProps) {
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [moduleFilter, setModuleFilter] = useState("all")

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(({ reservation, validation, customer }) => {
      const status = validation?.status ?? "pending"
      if (statusFilter !== "all" && status !== statusFilter) return false
      if (moduleFilter !== "all" && reservation.module !== moduleFilter) return false
      if (q) {
        const haystack = [
          reservation.publicRef,
          customer?.firstName,
          customer?.lastName,
          customer?.email,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [rows, search, statusFilter, moduleFilter])

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-64">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Rechercher une réservation..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="pending">En attente</SelectItem>
              <SelectItem value="pending_supplier">Attente fournisseur</SelectItem>
              <SelectItem value="pending_payment">Attente paiement</SelectItem>
              <SelectItem value="approved">Validées</SelectItem>
              <SelectItem value="rejected">Rejetées</SelectItem>
            </SelectContent>
          </Select>
          <Select value={moduleFilter} onValueChange={setModuleFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Module" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les modules</SelectItem>
              <SelectItem value="hotel">Hôtels</SelectItem>
              <SelectItem value="flight">Vols</SelectItem>
              <SelectItem value="package">Packages</SelectItem>
              <SelectItem value="omra">Omra</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Référence</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Module</TableHead>
                <TableHead>Montant</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Étape actuelle</TableHead>
                <TableHead>Soumis le</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Aucune validation ne correspond à ces filtres.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map(({ reservation, validation, customer }) => {
                  const statusConfig = validation
                    ? (STATUS_CONFIG[validation.status] ?? STATUS_CONFIG.pending)
                    : STATUS_CONFIG.pending
                  const StatusIcon = statusConfig.icon

                  return (
                    <TableRow key={reservation.id} className="hover:bg-gray-50">
                      <TableCell className="font-mono text-sm">
                        {reservation.publicRef}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">
                            {customer ? `${customer.firstName} ${customer.lastName}` : "—"}
                          </p>
                          <p className="text-xs text-gray-500">{customer?.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{reservation.module}</Badge>
                      </TableCell>
                      <TableCell className="font-semibold">
                        {Number(reservation.tndAmount).toLocaleString("fr-FR")} DT
                      </TableCell>
                      <TableCell>
                        <Badge className={statusConfig.color}>
                          <StatusIcon className="mr-1 h-3 w-3" />
                          {statusConfig.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-gray-500">
                        {validation?.currentStep || "initial"}
                      </TableCell>
                      <TableCell className="text-sm text-gray-500">
                        {new Date(
                          validation?.submittedAt ?? reservation.createdAt,
                        ).toLocaleDateString("fr-FR")}
                      </TableCell>
                      <TableCell className="text-right">
                        <ValidationRowActions
                          reservationId={reservation.id}
                          publicRef={reservation.publicRef}
                          canValidate={validation?.status === "pending"}
                        />
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
