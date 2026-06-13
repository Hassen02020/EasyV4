/**
 * /admin/validations — Gestion du workflow de validation des réservations
 *
 * Permet de valider, rejeter et suivre le processus de validation des réservations
 */

import { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import {
  Search,
  Filter,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Eye,
  FileText,
  MoreHorizontal,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { getDb } from "@/lib/db/client"
import { reservations, reservationValidations, validationStatus } from "@/lib/db/schema"
import { eq, desc } from "drizzle-orm"

export const metadata: Metadata = {
  title: "Validations Réservations — Manager",
  description: "Gestion du workflow de validation des réservations",
}

export const dynamic = "force-dynamic"

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: "En attente", color: "bg-amber-100 text-amber-800", icon: Clock },
  pending_supplier: { label: "Attente fournisseur", color: "bg-blue-100 text-blue-800", icon: AlertCircle },
  pending_payment: { label: "Attente paiement", color: "bg-purple-100 text-purple-800", icon: Clock },
  approved: { label: "Validé", color: "bg-emerald-100 text-emerald-800", icon: CheckCircle },
  rejected: { label: "Rejeté", color: "bg-red-100 text-red-800", icon: XCircle },
  cancelled: { label: "Annulé", color: "bg-gray-100 text-gray-800", icon: XCircle },
}

export default async function ValidationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string; module?: string }>
}) {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?next=/admin/validations")
  }

  const profile = await getCurrentAdminProfile(user.id)
  const allowedRoles = ["super_admin", "manager", "agent_resa"]
  if (!profile || !allowedRoles.includes(profile.role)) {
    redirect("/admin")
  }

  const params = (await searchParams) ?? {}
  const db = getDb()

  // Récupérer les réservations avec leurs validations
  const validationList = await db
    .select({
      reservation: reservations,
      validation: reservationValidations,
    })
    .from(reservations)
    .leftJoin(reservationValidations, eq(reservations.id, reservationValidations.reservationId))
    .orderBy(desc(reservations.createdAt))
    .limit(50)

  // Filtrer par statut si spécifié
  const filteredValidations = params.status
    ? validationList.filter((v) => v.validation?.status === params.status)
    : validationList

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-foreground text-3xl font-bold tracking-tight">
            Validations Réservations
          </h1>
          <p className="text-muted-foreground mt-1">
            Gérez le workflow de validation des réservations
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">En attente</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600">
              {validationList.filter((v) => v.validation?.status === "pending").length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Validées</CardTitle>
            <CheckCircle className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-600">
              {validationList.filter((v) => v.validation?.status === "approved").length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Rejetées</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">
              {validationList.filter((v) => v.validation?.status === "rejected").length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <FileText className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{validationList.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-64">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input placeholder="Rechercher une réservation..." className="pl-9" />
            </div>
            <Select defaultValue="all">
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
            <Select defaultValue="all">
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
                {filteredValidations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      Aucune validation en cours.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredValidations.map(({ reservation, validation }) => {
                    const statusConfig = validation
                      ? STATUS_CONFIG[validation.status] || STATUS_CONFIG.pending
                      : STATUS_CONFIG.pending
                    const StatusIcon = statusConfig.icon

                    return (
                      <TableRow key={reservation.id} className="hover:bg-gray-50">
                        <TableCell className="font-mono text-sm">
                          {reservation.reference}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{reservation.customerName}</p>
                            <p className="text-xs text-gray-500">{reservation.customerEmail}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{reservation.module}</Badge>
                        </TableCell>
                        <TableCell className="font-semibold">
                          {reservation.totalAmountTnd.toLocaleString("fr-FR")} DT
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
                          {validation?.submittedAt
                            ? new Date(validation.submittedAt).toLocaleDateString("fr-FR")
                            : new Date(reservation.createdAt).toLocaleDateString("fr-FR")}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuItem asChild>
                                <Link href={`/admin/reservations/${reservation.id}`}>
                                  <Eye className="mr-2 h-4 w-4" />
                                  Voir détails
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {validation?.status === "pending" && (
                                <>
                                  <DropdownMenuItem className="text-emerald-600">
                                    <CheckCircle className="mr-2 h-4 w-4" />
                                    Valider
                                  </DropdownMenuItem>
                                  <DropdownMenuItem className="text-red-600">
                                    <XCircle className="mr-2 h-4 w-4" />
                                    Rejeter
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
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
    </div>
  )
}
