/**
 * Gestion des Clients B2C — Manager
 *
 * Vue et gestion de la base clients
 */

import { Metadata } from "next"
import { redirect } from "next/navigation"
import {
  Users,
  Search,
  Mail,
  Phone,
  Calendar,
  ShoppingBag,
  User,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { B2cClientRowActions } from "@/components/admin/b2c-client-row-actions"
import { NewClientDialog } from "@/components/admin/new-client-dialog"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { withTenantContext } from "@/lib/db/tenant-context"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  B2C_CLIENTS_PAGE_SIZE,
  b2cClientStatsCore,
  listB2cClientsCore,
  normalizeClientQuery,
} from "@/lib/admin/b2c-clients-core"

export const metadata: Metadata = {
  title: "Clients B2C — Manager",
  description: "Gestion de la base clients",
}

export const dynamic = "force-dynamic"

async function loadClients(agencyId: string, q: string) {
  try {
    return await withTenantContext(
      { agencyId, userId: "", isSuperAdmin: false },
      async (db) => {
        const [clients, stats] = await Promise.all([
          listB2cClientsCore(db, { agencyId, q }),
          b2cClientStatsCore(db, { agencyId }),
        ])
        return { clients, stats }
      },
    )
  } catch (error) {
    console.error("[loadClients]", error)
    return {
      clients: [],
      stats: { total: 0, withReservations: 0, newThisMonth: 0 },
    }
  }
}

export default async function B2CClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const q = normalizeClientQuery((await searchParams).q)
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?next=/admin/b2c/clients")
  }

  const profile = await getCurrentAdminProfile(user.id)
  const allowedRoles = ["super_admin", "manager", "agent_resa"]
  if (!profile || !allowedRoles.includes(profile.role)) {
    redirect("/admin")
  }

  const { clients, stats } = await loadClients(profile.agencyId, q)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-foreground text-3xl font-bold tracking-tight">
            Clients B2C
          </h1>
          <p className="text-muted-foreground mt-1">
            Base de données clients et historique
          </p>
        </div>
        <NewClientDialog />
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Clients</CardTitle>
            <Users className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Avec Réservations
            </CardTitle>
            <ShoppingBag className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-600">
              {stats.withReservations}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Nouveaux ce mois
            </CardTitle>
            <Calendar className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">
              {stats.newThisMonth}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <CardHeader className="pb-3">
          <form
            method="get"
            className="flex max-w-xl flex-wrap items-center gap-2"
            role="search"
          >
            <div className="relative min-w-0 flex-1">
              <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <Input
                name="q"
                defaultValue={q}
                maxLength={100}
                placeholder="Nom, email ou téléphone…"
                aria-label="Rechercher un client"
                className="pl-9"
              />
            </div>
            <Button type="submit" size="sm">
              Rechercher
            </Button>
            {q ? (
              <Button asChild size="sm" variant="ghost">
                <Link href="/admin/b2c/clients">Effacer</Link>
              </Button>
            ) : null}
          </form>
          {q ? (
            <p className="text-muted-foreground text-sm">
              {clients.length} résultat{clients.length > 1 ? "s" : ""} pour «{" "}
              {q} »
              {clients.length >= B2C_CLIENTS_PAGE_SIZE
                ? ` (${B2C_CLIENTS_PAGE_SIZE} premiers affichés — affinez la recherche)`
                : ""}
            </p>
          ) : stats.total > B2C_CLIENTS_PAGE_SIZE ? (
            <p className="text-muted-foreground text-sm">
              {B2C_CLIENTS_PAGE_SIZE} clients les plus récents affichés sur{" "}
              {stats.total} — utilisez la recherche.
            </p>
          ) : null}
        </CardHeader>
        <CardContent>
          {clients.length === 0 ? (
            <div className="py-12 text-center">
              <Users className="text-muted-foreground mx-auto h-12 w-12" />
              <p className="text-muted-foreground mt-4">
                {q ? `Aucun client ne correspond à « ${q} »` : "Aucun client"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Localisation</TableHead>
                    <TableHead>Réservations</TableHead>
                    <TableHead>Inscription</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clients.map((client) => (
                    <TableRow key={client.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="bg-muted flex h-8 w-8 items-center justify-center rounded-full">
                            <User className="text-muted-foreground h-4 w-4" />
                          </div>
                          <div>
                            <p className="font-medium">
                              {client.firstName} {client.lastName}
                            </p>
                            {client.civicId && (
                              <p className="text-muted-foreground text-xs">
                                CIN: {client.civicId}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="flex items-center gap-1 text-sm">
                            <Mail className="text-muted-foreground h-3 w-3" />
                            {client.email}
                          </div>
                          {client.phone && (
                            <div className="flex items-center gap-1 text-sm">
                              <Phone className="text-muted-foreground h-3 w-3" />
                              {client.phone}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm">{client.city || "—"}</p>
                        <p className="text-muted-foreground text-xs">
                          {client.country || "—"}
                        </p>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            client.reservationCount > 0
                              ? "default"
                              : "secondary"
                          }
                        >
                          {client.reservationCount} réservation
                          {client.reservationCount !== 1 ? "s" : ""}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(client.createdAt).toLocaleDateString("fr-FR")}
                      </TableCell>
                      <TableCell className="text-right">
                        <B2cClientRowActions
                          client={{
                            id: client.id,
                            civility:
                              (client.civility as
                                | "M"
                                | "Mme"
                                | "Mlle"
                                | null) ?? null,
                            firstName: client.firstName,
                            lastName: client.lastName,
                            email: client.email,
                            phone: client.phone,
                            civicId: client.civicId,
                            city: client.city,
                            country: client.country,
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
