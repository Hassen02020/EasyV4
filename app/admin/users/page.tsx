/**
 * Gestion des utilisateurs — Super Admin uniquement
 * 
 * CRUD complet des utilisateurs avec gestion des rôles
 */

import { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import {
  Users,
  Plus,
  Search,
  MoreHorizontal,
  Shield,
  Building2,
  User,
  CheckCircle2,
  XCircle,
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
import { users, agencies } from "@/lib/db/schema"
import { desc } from "drizzle-orm"

export const metadata: Metadata = {
  title: "Gestion Utilisateurs — Super Admin",
  description: "Gestion des utilisateurs et rôles",
}

export const dynamic = "force-dynamic"

// Rôles disponibles
const ROLE_CONFIG: Record<string, { label: string; color: string; icon: typeof Shield }> = {
  super_admin: { label: "Super Admin", color: "bg-purple-100 text-purple-800", icon: Shield },
  manager: { label: "Manager", color: "bg-blue-100 text-blue-800", icon: User },
  agent_resa: { label: "Agent Résa", color: "bg-green-100 text-green-800", icon: User },
  agent_compta: { label: "Agent Compta", color: "bg-yellow-100 text-yellow-800", icon: User },
  agent_excursions: { label: "Agent Excursions", color: "bg-orange-100 text-orange-800", icon: User },
  partner_owner: { label: "Propriétaire B2B", color: "bg-pink-100 text-pink-800", icon: Building2 },
  partner_agent: { label: "Agent B2B", color: "bg-teal-100 text-teal-800", icon: Building2 },
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  active: { label: "Actif", color: "bg-green-100 text-green-800" },
  suspended: { label: "Suspendu", color: "bg-red-100 text-red-800" },
}

async function loadUsers() {
  try {
    const db = getDb()
    const allUsers = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        status: users.status,
        agencyId: users.agencyId,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt))

    // Récupérer les noms d'agences
    const agencyIds = allUsers.map((u) => u.agencyId).filter(Boolean)
    const agenciesData = agencyIds.length > 0
      ? await db
          .select({ id: agencies.id, name: agencies.name })
          .from(agencies)
          .where(...agencyIds.map((id) => agencies.id))
      : []

    const agencyMap = new Map(agenciesData.map((a) => [a.id, a.name]))

    return allUsers.map((u) => ({
      ...u,
      agencyName: agencyMap.get(u.agencyId) ?? "Easy2Book (OTA)",
    }))
  } catch (error) {
    console.error("[loadUsers]", error)
    return []
  }
}

export default async function UsersManagementPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?next=/admin/users")
  }

  const profile = await getCurrentAdminProfile(user.id)

  // Vérification Super Admin
  if (profile?.role !== "super_admin") {
    redirect("/admin")
  }

  const allUsers = await loadUsers()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-foreground text-3xl font-bold tracking-tight">
            Gestion des Utilisateurs
          </h1>
          <p className="text-muted-foreground mt-1">
            Administration des comptes et rôles — {allUsers.length} utilisateurs
          </p>
        </div>
        <Button className="bg-purple-600 hover:bg-purple-700" asChild>
          <Link href="/admin/users/new">
            <Plus className="mr-2 h-4 w-4" />
            Nouvel Utilisateur
          </Link>
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <Users className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{allUsers.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Actifs</CardTitle>
            <CheckCircle2 className="text-green-500 h-4 w-4" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {allUsers.filter((u) => u.status === "active").length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Suspendus</CardTitle>
            <XCircle className="text-red-500 h-4 w-4" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {allUsers.filter((u) => u.status === "suspended").length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Super Admins</CardTitle>
            <Shield className="text-purple-500 h-4 w-4" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {allUsers.filter((u) => u.role === "super_admin").length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>Liste des Utilisateurs</CardTitle>
          <CardDescription>
            Gérez les accès, rôles et statuts des utilisateurs
          </CardDescription>
        </CardHeader>
        <CardContent>
          {allUsers.length === 0 ? (
            <div className="py-12 text-center">
              <Users className="mx-auto h-12 w-12 text-gray-300" />
              <p className="text-muted-foreground mt-4">
                Aucun utilisateur trouvé. Créez le premier utilisateur.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Utilisateur</TableHead>
                    <TableHead>Rôle</TableHead>
                    <TableHead>Agence</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Dernière Connexion</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allUsers.map((user) => {
                    const roleConfig = ROLE_CONFIG[user.role] || { label: user.role, color: "bg-gray-100", icon: User }
                    const RoleIcon = roleConfig.icon
                    const statusConfig = STATUS_CONFIG[user.status] || { label: user.status, color: "bg-gray-100" }

                    return (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100">
                              <span className="text-xs font-semibold">
                                {user.name?.charAt(0).toUpperCase() || user.email.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium">{user.name || "—"}</p>
                              <p className="text-muted-foreground text-xs">{user.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={roleConfig.color}>
                            <RoleIcon className="mr-1 h-3 w-3" />
                            {roleConfig.label}
                          </Badge>
                        </TableCell>
                        <TableCell>{user.agencyName}</TableCell>
                        <TableCell>
                          <Badge className={statusConfig.color}>{statusConfig.label}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {user.lastLoginAt
                            ? new Date(user.lastLoginAt).toLocaleDateString("fr-FR")
                            : "Jamais"}
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
                                <Link href={`/admin/users/${user.id}`}>Modifier</Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem>Changer le rôle</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {user.status === "active" ? (
                                <DropdownMenuItem className="text-red-600">
                                  Suspendre
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem className="text-green-600">
                                  Réactiver
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
        </CardContent>
      </Card>
    </div>
  )
}
