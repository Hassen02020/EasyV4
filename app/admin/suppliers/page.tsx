/**
 * /admin/suppliers — Gestion des fournisseurs API XML
 *
 * Permet de configurer et gérer les connexions aux fournisseurs externes
 * (MyGo, Amadeus, Sabre, Expedia, etc.)
 */

import { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import {
  Plus,
  Search,
  Settings,
  Activity,
  RefreshCw,
  Plug,
  AlertCircle,
  CheckCircle,
  Clock,
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
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { getDb } from "@/lib/db/client"
import { suppliers, supplierStatus, supplierType } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export const metadata: Metadata = {
  title: "Fournisseurs API — Manager",
  description: "Gestion des connexions API XML fournisseurs",
}

export const dynamic = "force-dynamic"

const SUPPLIER_TYPE_LABELS: Record<string, string> = {
  mygo: "MyGo",
  amadeus: "Amadeus",
  sabre: "Sabre",
  expedia: "Expedia",
  booking: "Booking.com",
  travelgate: "Travelgate",
  hotelbeds: "Hotelbeds",
  custom: "Custom",
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  active: { label: "Actif", color: "bg-emerald-100 text-emerald-800", icon: CheckCircle },
  inactive: { label: "Inactif", color: "bg-gray-100 text-gray-800", icon: Clock },
  maintenance: { label: "Maintenance", color: "bg-amber-100 text-amber-800", icon: AlertCircle },
  error: { label: "Erreur", color: "bg-red-100 text-red-800", icon: AlertCircle },
}

export default async function SuppliersPage() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?next=/admin/suppliers")
  }

  const profile = await getCurrentAdminProfile(user.id)
  const allowedRoles = ["super_admin", "manager"]
  if (!profile || !allowedRoles.includes(profile.role)) {
    redirect("/admin")
  }

  const db = getDb()
  const supplierList = await db.select().from(suppliers).orderBy(suppliers.name)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-foreground text-3xl font-bold tracking-tight">
            Fournisseurs API
          </h1>
          <p className="text-muted-foreground mt-1">
            Configurez et gérez les connexions API XML aux fournisseurs externes
          </p>
        </div>
        <Button className="bg-[#1e3a5f]" asChild>
          <Link href="/admin/suppliers/new">
            <Plus className="mr-2 h-4 w-4" />
            Nouveau fournisseur
          </Link>
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Fournisseurs</CardTitle>
            <Plug className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{supplierList.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Actifs</CardTitle>
            <CheckCircle className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-600">
              {supplierList.filter((s) => s.status === "active").length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">En Maintenance</CardTitle>
            <AlertCircle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600">
              {supplierList.filter((s) => s.status === "maintenance").length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Auto-sync</CardTitle>
            <RefreshCw className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-purple-600">
              {supplierList.filter((s) => s.autoSync).length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Suppliers Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-64">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input placeholder="Rechercher un fournisseur..." className="pl-9" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>API URL</TableHead>
                  <TableHead>Auto-sync</TableHead>
                  <TableHead>Dernière Sync</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {supplierList.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Aucun fournisseur configuré. Commencez par en ajouter un.
                    </TableCell>
                  </TableRow>
                ) : (
                  supplierList.map((supplier) => {
                    const statusConfig = STATUS_CONFIG[supplier.status] || STATUS_CONFIG.inactive
                    const StatusIcon = statusConfig.icon

                    return (
                      <TableRow key={supplier.id} className="hover:bg-gray-50">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="bg-primary/10 text-primary flex h-10 w-10 items-center justify-center rounded-lg">
                              <Plug className="h-5 w-5" />
                            </div>
                            <div>
                              <p className="font-medium">{supplier.name}</p>
                              {supplier.website && (
                                <a
                                  href={supplier.website}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-blue-600 hover:underline"
                                >
                                  {supplier.website}
                                </a>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {SUPPLIER_TYPE_LABELS[supplier.type] || supplier.type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={statusConfig.color}>
                            <StatusIcon className="mr-1 h-3 w-3" />
                            {statusConfig.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {supplier.apiUrl || "—"}
                        </TableCell>
                        <TableCell>
                          {supplier.autoSync ? (
                            <Badge className="bg-purple-100 text-purple-800">
                              <RefreshCw className="mr-1 h-3 w-3" />
                              {supplier.syncInterval}
                            </Badge>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-gray-500">
                          {supplier.lastSyncAt
                            ? new Date(supplier.lastSyncAt).toLocaleString("fr-FR")
                            : "Jamais"}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <Settings className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuItem asChild>
                                <Link href={`/admin/suppliers/${supplier.id}`}>
                                  <Activity className="mr-2 h-4 w-4" />
                                  Voir détails
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link href={`/admin/suppliers/${supplier.id}/edit`}>
                                  <Settings className="mr-2 h-4 w-4" />
                                  Configurer
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem>
                                <RefreshCw className="mr-2 h-4 w-4" />
                                Synchroniser maintenant
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <AlertCircle className="mr-2 h-4 w-4" />
                                {supplier.status === "active" ? "Désactiver" : "Activer"}
                              </DropdownMenuItem>
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
