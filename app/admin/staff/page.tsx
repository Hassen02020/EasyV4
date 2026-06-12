/**
 * Gestion du Personnel — Manager
 *
 * Vue et gestion des agents de l'agence
 */

import { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import {
  UserCog,
  Plus,
  Mail,
  Phone,
  Calendar,
  CheckCircle2,
  XCircle,
  MoreHorizontal,
  Edit,
  Eye,
  Shield,
  User,
  ShoppingBag,
  DollarSign,
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
import { users } from "@/lib/db/schema"
import { eq, desc } from "drizzle-orm"

export const metadata: Metadata = {
  title: "Personnel — Manager",
  description: "Gestion des agents de l'agence",
}

export const dynamic = "force-dynamic"

const ROLE_CONFIG: Record<
  string,
  { label: string; color: string; icon: typeof User }
> = {
  manager: {
    label: "Manager",
    color: "bg-purple-100 text-purple-800",
    icon: Shield,
  },
  agent_resa: {
    label: "Agent Réservation",
    color: "bg-blue-100 text-blue-800",
    icon: ShoppingBag,
  },
  agent_compta: {
    label: "Agent Compta",
    color: "bg-green-100 text-green-800",
    icon: DollarSign,
  },
  agent_excursions: {
    label: "Agent Excursions",
    color: "bg-orange-100 text-orange-800",
    icon: User,
  },
}

async function loadStaff(agencyId: string) {
  try {
    const db = getDb()
    const staff = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        status: users.status,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.agencyId, agencyId))
      .orderBy(desc(users.createdAt))

    return staff
  } catch (error) {
    console.error("[loadStaff]", error)
    return []
  }
}

export default async function StaffPage() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?next=/admin/staff")
  }

  const profile = await getCurrentAdminProfile(user.id)
  const allowedRoles = ["super_admin", "manager"]
  if (!profile || !allowedRoles.includes(profile.role)) {
    redirect("/admin")
  }

  const staff = await loadStaff(profile.agencyId)

  const stats = {
    total: staff.length,
    active: staff.filter((s) => s.status === "active").length,
    byRole: {
      agent_resa: staff.filter((s) => s.role === "agent_resa").length,
      agent_compta: staff.filter((s) => s.role === "agent_compta").length,
      agent_excursions: staff.filter((s) => s.role === "agent_excursions")
        .length,
    },
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-foreground text-3xl font-bold tracking-tight">
            Personnel
          </h1>
          <p className="text-muted-foreground mt-1">
            Gérez les agents de votre agence — {stats.total} membres
          </p>
        </div>
        <Button className="bg-[#1e3a5f]" asChild>
          <Link href="/admin/staff/new">
            <Plus className="mr-2 h-4 w-4" />
            Nouvel agent
          </Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Agents</CardTitle>
            <UserCog className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Actifs</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-600">
              {stats.active}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Agents Résa</CardTitle>
            <ShoppingBag className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">
              {stats.byRole.agent_resa}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Agents Compta</CardTitle>
            <DollarSign className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">
              {stats.byRole.agent_compta}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Staff Table */}
      <Card>
        <CardHeader>
          <CardTitle>Liste du Personnel</CardTitle>
          <CardDescription>
            Agents et collaborateurs de votre agence
          </CardDescription>
        </CardHeader>
        <CardContent>
          {staff.length === 0 ? (
            <div className="py-12 text-center">
              <UserCog className="mx-auto h-12 w-12 text-gray-300" />
              <p className="text-muted-foreground mt-4">
                Aucun agent trouvé. Créez votre première équipe.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agent</TableHead>
                    <TableHead>Rôle</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Dernière Connexion</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staff.map((member) => {
                    const roleConfig = ROLE_CONFIG[member.role] || {
                      label: member.role,
                      color: "bg-gray-100",
                      icon: User,
                    }
                    const RoleIcon = roleConfig.icon

                    return (
                      <TableRow key={member.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100">
                              <span className="text-xs font-bold">
                                {member.name?.charAt(0).toUpperCase() ||
                                  member.email.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium">
                                {member.name || "—"}
                              </p>
                              <p className="text-xs text-gray-500">
                                {member.email}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={roleConfig.color}>
                            <RoleIcon className="mr-1 h-3 w-3" />
                            {roleConfig.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm">
                            <Mail className="h-3 w-3 text-gray-400" />
                            {member.email}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={
                              member.status === "active"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-red-100 text-red-800"
                            }
                          >
                            {member.status === "active" ? "Actif" : "Suspendu"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-gray-500">
                          {member.lastLoginAt
                            ? new Date(member.lastLoginAt).toLocaleDateString(
                                "fr-FR",
                              )
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
                                <Link href={`/admin/staff/${member.id}`}>
                                  <Eye className="mr-2 h-4 w-4" />
                                  Voir profil
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <Edit className="mr-2 h-4 w-4" />
                                Modifier
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {member.status === "active" ? (
                                <DropdownMenuItem className="text-red-600">
                                  <XCircle className="mr-2 h-4 w-4" />
                                  Suspendre
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem className="text-emerald-600">
                                  <CheckCircle2 className="mr-2 h-4 w-4" />
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
