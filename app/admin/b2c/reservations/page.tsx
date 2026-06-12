/**
 * Gestion des Réservations B2C — Manager/Agent
 *
 * Vue complète des réservations clients avec filtres et actions
 */

import { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import {
  ShoppingBag,
  Search,
  Filter,
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  DollarSign,
  MoreHorizontal,
  Download,
  Eye,
  Edit,
  Trash2,
  User,
  Plane,
  Building2,
  Moon,
  Briefcase,
  Bus,
  Car,
} from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { getDb } from "@/lib/db/client"
import { reservations, customers } from "@/lib/db/schema"
import { desc, eq, and, or, like, inArray } from "drizzle-orm"

export const metadata: Metadata = {
  title: "Réservations B2C — Manager",
  description: "Gestion des réservations clients",
}

export const dynamic = "force-dynamic"

const MODULE_ICONS: Record<string, typeof Plane> = {
  flight: Plane,
  hotel: Building2,
  hotel_world: Building2,
  omra: Moon,
  package: Briefcase,
  transfer: Bus,
  car: Car,
}

const MODULE_LABELS: Record<string, string> = {
  flight: "Vol",
  hotel: "Hôtel",
  hotel_world: "Hôtel Int.",
  omra: "Omra",
  package: "Package",
  transfer: "Transfert",
  car: "Voiture",
}

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; icon: typeof CheckCircle2 }
> = {
  pending: {
    label: "En attente",
    color: "bg-amber-100 text-amber-800",
    icon: Clock,
  },
  on_request: {
    label: "Sur demande",
    color: "bg-blue-100 text-blue-800",
    icon: Clock,
  },
  confirmed: {
    label: "Confirmée",
    color: "bg-emerald-100 text-emerald-800",
    icon: CheckCircle2,
  },
  cancelled: {
    label: "Annulée",
    color: "bg-red-100 text-red-800",
    icon: XCircle,
  },
  refunded: {
    label: "Remboursée",
    color: "bg-gray-100 text-gray-800",
    icon: XCircle,
  },
  no_show: {
    label: "No-show",
    color: "bg-red-100 text-red-700",
    icon: XCircle,
  },
}

async function loadReservations(search?: string, status?: string) {
  try {
    const db = getDb()

    let query = db
      .select({
        id: reservations.id,
        publicRef: reservations.publicRef,
        module: reservations.module,
        status: reservations.status,
        originalAmount: reservations.originalAmount,
        originalCurrency: reservations.originalCurrency,
        tndAmount: reservations.tndAmount,
        createdAt: reservations.createdAt,
        customerId: reservations.customerId,
      })
      .from(reservations)

    // Jointure avec customers
    const allReservations = await query
      .orderBy(desc(reservations.createdAt))
      .limit(100)

    // Récupérer les clients
    const customerIds = allReservations.map((r) => r.customerId).filter(Boolean)
    const customersData =
      customerIds.length > 0
        ? await db
            .select({
              id: customers.id,
              firstName: customers.firstName,
              lastName: customers.lastName,
              email: customers.email,
              phone: customers.phone,
            })
            .from(customers)
            .where(inArray(customers.id, customerIds))
        : []

    const customerMap = new Map(customersData.map((c) => [c.id, c]))

    return allReservations.map((r) => ({
      ...r,
      customer: customerMap.get(r.customerId) || {
        firstName: "—",
        lastName: "",
        email: "—",
        phone: null,
      },
      tndAmount: parseFloat(r.tndAmount as string) || 0,
    }))
  } catch (error) {
    console.error("[loadReservations]", error)
    return []
  }
}

export default async function B2CReservationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string }>
}) {
  const { status, search } = await searchParams

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?next=/admin/b2c/reservations")
  }

  const profile = await getCurrentAdminProfile(user.id)

  // Vérification rôle autorisé
  const allowedRoles = ["super_admin", "manager", "agent_resa", "agent_compta"]
  if (!profile || !allowedRoles.includes(profile.role)) {
    redirect("/admin")
  }

  const allReservations = await loadReservations(search, status)

  // Filtrer par status si spécifié
  const filteredReservations = status
    ? allReservations.filter((r) => r.status === status)
    : allReservations

  const stats = {
    total: allReservations.length,
    pending: allReservations.filter(
      (r) => r.status === "pending" || r.status === "on_request",
    ).length,
    confirmed: allReservations.filter((r) => r.status === "confirmed").length,
    cancelled: allReservations.filter(
      (r) => r.status === "cancelled" || r.status === "refunded",
    ).length,
    revenue: allReservations
      .filter((r) => r.status === "confirmed")
      .reduce((sum, r) => sum + r.tndAmount, 0),
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-foreground text-3xl font-bold tracking-tight">
            Réservations B2C
          </h1>
          <p className="text-muted-foreground mt-1">
            Gérez les réservations clients et leurs statuts
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button size="sm" className="bg-[#1e3a5f]" asChild>
            <Link href="/admin/b2c/reservations/new">Nouvelle réservation</Link>
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <ShoppingBag className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">En attente</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600">{stats.pending}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Confirmées</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-600">
              {stats.confirmed}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Annulées</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">{stats.cancelled}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">CA Confirmé</CardTitle>
            <DollarSign className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {stats.revenue.toLocaleString("fr-FR")} DT
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filtres et recherche */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Rechercher par référence, client..."
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm">
                <Filter className="mr-2 h-4 w-4" />
                Filtres
              </Button>
              <Button variant="outline" size="sm">
                <Calendar className="mr-2 h-4 w-4" />
                Période
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue={status || "all"} className="space-y-4">
            <TabsList>
              <TabsTrigger value="all" asChild>
                <Link href="/admin/b2c/reservations">Toutes</Link>
              </TabsTrigger>
              <TabsTrigger value="pending" asChild>
                <Link href="/admin/b2c/reservations?status=pending">
                  En attente
                </Link>
              </TabsTrigger>
              <TabsTrigger value="confirmed" asChild>
                <Link href="/admin/b2c/reservations?status=confirmed">
                  Confirmées
                </Link>
              </TabsTrigger>
              <TabsTrigger value="cancelled" asChild>
                <Link href="/admin/b2c/reservations?status=cancelled">
                  Annulées
                </Link>
              </TabsTrigger>
            </TabsList>

            <TabsContent value={status || "all"} className="space-y-4">
              {filteredReservations.length === 0 ? (
                <div className="py-12 text-center">
                  <ShoppingBag className="mx-auto h-12 w-12 text-gray-300" />
                  <p className="text-muted-foreground mt-4">
                    Aucune réservation trouvée
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Référence</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Statut</TableHead>
                        <TableHead className="text-right">Montant</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredReservations.map((reservation) => {
                        const ModuleIcon =
                          MODULE_ICONS[reservation.module] || Plane
                        const moduleLabel =
                          MODULE_LABELS[reservation.module] ||
                          reservation.module
                        const statusConfig =
                          STATUS_CONFIG[reservation.status] ||
                          STATUS_CONFIG.pending
                        const StatusIcon = statusConfig.icon

                        return (
                          <TableRow key={reservation.id}>
                            <TableCell>
                              <code className="rounded bg-gray-100 px-2 py-1 font-mono text-sm">
                                {reservation.publicRef}
                              </code>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <User className="h-4 w-4 text-gray-400" />
                                <div>
                                  <p className="font-medium">
                                    {reservation.customer.firstName}{" "}
                                    {reservation.customer.lastName}
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    {reservation.customer.email}
                                  </p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <ModuleIcon className="h-4 w-4 text-gray-500" />
                                <span className="text-sm">{moduleLabel}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge className={statusConfig.color}>
                                <StatusIcon className="mr-1 h-3 w-3" />
                                {statusConfig.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {reservation.tndAmount.toLocaleString("fr-FR")} DT
                            </TableCell>
                            <TableCell className="text-sm text-gray-500">
                              {new Date(
                                reservation.createdAt,
                              ).toLocaleDateString("fr-FR")}
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
                                    <Link
                                      href={`/admin/b2c/reservations/${reservation.id}`}
                                    >
                                      <Eye className="mr-2 h-4 w-4" />
                                      Voir détails
                                    </Link>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem>
                                    <Edit className="mr-2 h-4 w-4" />
                                    Modifier
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  {reservation.status === "pending" && (
                                    <DropdownMenuItem className="text-emerald-600">
                                      <CheckCircle2 className="mr-2 h-4 w-4" />
                                      Confirmer
                                    </DropdownMenuItem>
                                  )}
                                  {(reservation.status === "pending" ||
                                    reservation.status === "confirmed") && (
                                    <DropdownMenuItem className="text-red-600">
                                      <XCircle className="mr-2 h-4 w-4" />
                                      Annuler
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
