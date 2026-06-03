/**
 * Gestion des Agences — Super Admin uniquement
 * 
 * CRUD des agences partenaires B2B et OTA
 */

import { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import {
  Building,
  Plus,
  MoreHorizontal,
  Building2,
  CheckCircle2,
  XCircle,
  DollarSign,
  Users,
} from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
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
import { agencies, users } from "@/lib/db/schema"
import { eq, desc, sql, count } from "drizzle-orm"

export const metadata: Metadata = {
  title: "Gestion Agences — Super Admin",
  description: "Administration des agences partenaires",
}

export const dynamic = "force-dynamic"

const AGENCY_TYPE_LABEL: Record<string, string> = {
  ota: "OTA",
  partner: "Partenaire B2B",
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  active: { label: "Active", color: "bg-green-100 text-green-800" },
  suspended: { label: "Suspendue", color: "bg-red-100 text-red-800" },
  pending: { label: "En attente", color: "bg-amber-100 text-amber-800" },
}

async function loadAgencies() {
  try {
    const db = getDb()

    // Agences avec compte d'utilisateurs
    const allAgencies = await db
      .select({
        id: agencies.id,
        name: agencies.name,
        slug: agencies.slug,
        brandName: agencies.brandName,
        agencyType: agencies.agencyType,
        contactEmail: agencies.contactEmail,
        contactPhone: agencies.contactPhone,
        depositBalance: agencies.depositBalance,
        creditLowThreshold: agencies.creditLowThreshold,
        status: agencies.status,
        createdAt: agencies.createdAt,
      })
      .from(agencies)
      .orderBy(desc(agencies.createdAt))

    // Compter les utilisateurs par agence
    const userCounts = await db
      .select({
        agencyId: users.agencyId,
        count: count(users.id),
      })
      .from(users)
      .groupBy(users.agencyId)

    const userCountMap = new Map(userCounts.map((u) => [u.agencyId, u.count]))

    return allAgencies.map((a) => ({
      ...a,
      userCount: userCountMap.get(a.id) || 0,
      depositBalance: parseFloat(a.depositBalance as string) || 0,
      creditLowThreshold: parseFloat(a.creditLowThreshold as string) || 100,
    }))
  } catch (error) {
    console.error("[loadAgencies]", error)
    return []
  }
}

export default async function AgenciesManagementPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?next=/admin/agencies")
  }

  const profile = await getCurrentAdminProfile(user.id)

  if (profile?.role !== "super_admin") {
    redirect("/admin")
  }

  const allAgencies = await loadAgencies()

  const otaCount = allAgencies.filter((a) => a.agencyType === "ota").length
  const partnerCount = allAgencies.filter((a) => a.agencyType === "partner").length
  const totalBalance = allAgencies.reduce((sum, a) => sum + a.depositBalance, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-foreground text-3xl font-bold tracking-tight">
            Gestion des Agences
          </h1>
          <p className="text-muted-foreground mt-1">
            Administration des agences OTA et partenaires B2B — {allAgencies.length} agences
          </p>
        </div>
        <Button className="bg-blue-600 hover:bg-blue-700" asChild>
          <Link href="/admin/agencies/new">
            <Plus className="mr-2 h-4 w-4" />
            Nouvelle Agence
          </Link>
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Agences</CardTitle>
            <Building className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{allAgencies.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">OTA</CardTitle>
            <CheckCircle2 className="text-blue-500 h-4 w-4" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{otaCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Partenaires B2B</CardTitle>
            <Building2 className="text-purple-500 h-4 w-4" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{partnerCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Solde Global B2B</CardTitle>
            <DollarSign className="text-green-500 h-4 w-4" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalBalance.toLocaleString("fr-FR")} DT</p>
          </CardContent>
        </Card>
      </div>

      {/* Agencies Table */}
      <Card>
        <CardHeader>
          <CardTitle>Liste des Agences</CardTitle>
          <CardDescription>
            Gérez les agences, leurs soldes et leurs accès
          </CardDescription>
        </CardHeader>
        <CardContent>
          {allAgencies.length === 0 ? (
            <div className="py-12 text-center">
              <Building className="mx-auto h-12 w-12 text-gray-300" />
              <p className="text-muted-foreground mt-4">
                Aucune agence trouvée. Créez la première agence.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agence</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Utilisateurs</TableHead>
                    <TableHead>Solde Wallet</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allAgencies.map((agency) => {
                    const statusConfig = STATUS_CONFIG[agency.status] || { label: agency.status, color: "bg-gray-100" }
                    const balancePercent = Math.min(
                      100,
                      (agency.depositBalance / Math.max(agency.creditLowThreshold * 2, 1)) * 100
                    )
                    const isLowBalance = agency.depositBalance <= agency.creditLowThreshold

                    return (
                      <TableRow key={agency.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100">
                              <span className="text-xs font-bold">
                                {agency.brandName?.charAt(0) || agency.name.charAt(0)}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium">{agency.brandName || agency.name}</p>
                              <p className="text-muted-foreground text-xs">{agency.slug}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={agency.agencyType === "ota" ? "default" : "secondary"}>
                            {AGENCY_TYPE_LABEL[agency.agencyType] || agency.agencyType}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            <span>{agency.userCount}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {agency.agencyType === "partner" ? (
                            <div className="w-32">
                              <div className="flex items-center justify-between text-xs">
                                <span className={isLowBalance ? "text-red-600 font-medium" : ""}>
                                  {agency.depositBalance.toLocaleString("fr-FR")} DT
                                </span>
                              </div>
                              <Progress
                                value={balancePercent}
                                className={`h-1 mt-1 ${isLowBalance ? "bg-red-200" : ""}`}
                              />
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge className={statusConfig.color}>{statusConfig.label}</Badge>
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
                                <Link href={`/admin/agencies/${agency.id}`}>Modifier</Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link href={`/admin/agencies/${agency.id}/users`}>Gérer Utilisateurs</Link>
                              </DropdownMenuItem>
                              {agency.agencyType === "partner" && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem>Recharger Solde</DropdownMenuItem>
                                  <DropdownMenuItem>Voir Transactions</DropdownMenuItem>
                                </>
                              )}
                              <DropdownMenuSeparator />
                              {agency.status === "active" ? (
                                <DropdownMenuItem className="text-red-600">Suspendre</DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem className="text-green-600">Activer</DropdownMenuItem>
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
        </CardContent>
      </Card>
    </div>
  )
}
