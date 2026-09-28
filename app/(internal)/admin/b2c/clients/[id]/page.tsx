/**
 * /admin/b2c/clients/[id] — Profil client B2C, Manager.
 *
 * Cible de "Voir profil" dans B2cClientRowActions — jusqu'ici `disabled`
 * ("Pas encore disponible"). Scoping agence identique à loadClients()
 * (app/admin/b2c/clients/page.tsx) : jamais cross-tenant, notFound() si le
 * client n'appartient pas à l'agence du staff appelant (jamais un 403
 * distinguable d'un 404, pour ne pas révéler l'existence d'un client d'une
 * autre agence).
 */

import { Metadata } from "next"
import Link from "next/link"
import { redirect, notFound } from "next/navigation"
import { ArrowLeft, Mail, Phone, MapPin, IdCard, Calendar, ShoppingBag } from "lucide-react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { B2cClientRowActions } from "@/components/admin/b2c-client-row-actions"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { withTenantContext } from "@/lib/db/tenant-context"
import { customers, reservations } from "@/lib/db/schema"
import { eq, and, desc } from "drizzle-orm"

export const metadata: Metadata = {
  title: "Profil client — Manager",
}

export const dynamic = "force-dynamic"

const STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  on_request: "Sur demande",
  confirmed: "Confirmée",
  cancelled: "Annulée",
  refunded: "Remboursée",
  no_show: "No-show",
}

async function loadClientProfile(agencyId: string, clientId: string) {
  return withTenantContext({ agencyId, userId: "", isSuperAdmin: false }, async (db) => {
    const [client] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.id, clientId), eq(customers.agencyId, agencyId)))
      .limit(1)
    if (!client) return null

    const clientReservations = await db
      .select({
        id: reservations.id,
        publicRef: reservations.publicRef,
        module: reservations.module,
        status: reservations.status,
        tndAmount: reservations.tndAmount,
        createdAt: reservations.createdAt,
      })
      .from(reservations)
      .where(and(eq(reservations.agencyId, agencyId), eq(reservations.customerId, clientId)))
      .orderBy(desc(reservations.createdAt))
      .limit(20)

    return { client, clientReservations }
  })
}

export default async function B2CClientProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=/admin/b2c/clients/${id}`)

  const profile = await getCurrentAdminProfile(user.id)
  const allowedRoles = ["super_admin", "manager", "agent_resa"]
  if (!profile || !allowedRoles.includes(profile.role)) {
    redirect("/admin")
  }

  const result = await loadClientProfile(profile.agencyId, id)
  if (!result) notFound()
  const { client, clientReservations } = result

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/admin/b2c/clients">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-foreground text-2xl font-bold tracking-tight">
              {client.civility ? `${client.civility} ` : ""}
              {client.firstName} {client.lastName}
            </h1>
            <p className="text-muted-foreground text-sm">Client depuis le {new Date(client.createdAt).toLocaleDateString("fr-FR")}</p>
          </div>
        </div>
        <B2cClientRowActions
          client={{
            id: client.id,
            civility: (client.civility as "M" | "Mme" | "Mlle" | null) ?? null,
            firstName: client.firstName,
            lastName: client.lastName,
            email: client.email,
            phone: client.phone,
            civicId: client.civicId,
            city: client.city,
            country: client.country,
          }}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Coordonnées</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <Mail className="text-muted-foreground h-4 w-4" />
              {client.email || "—"}
            </div>
            <div className="flex items-center gap-2">
              <Phone className="text-muted-foreground h-4 w-4" />
              {client.phone || "—"}
            </div>
            <div className="flex items-center gap-2">
              <IdCard className="text-muted-foreground h-4 w-4" />
              {client.civicId || "—"}
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="text-muted-foreground h-4 w-4" />
              {[client.city, client.country].filter(Boolean).join(", ") || "—"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Activité</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <ShoppingBag className="text-muted-foreground h-4 w-4" />
              {clientReservations.length} réservation{clientReservations.length !== 1 ? "s" : ""} (20 plus récentes)
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="text-muted-foreground h-4 w-4" />
              Inscrit le {new Date(client.createdAt).toLocaleDateString("fr-FR")}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Réservations récentes</CardTitle>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/admin/b2c/reservations?customerId=${client.id}`}>Voir toutes les réservations</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {clientReservations.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">Aucune réservation pour ce client.</p>
          ) : (
            <ul className="divide-y">
              {clientReservations.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <code className="rounded bg-gray-100 px-2 py-1 font-mono text-xs">{r.publicRef}</code>
                    <Badge variant="secondary">{STATUS_LABELS[r.status] || r.status}</Badge>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="font-medium">{parseFloat(r.tndAmount as string).toLocaleString("fr-FR")} DT</span>
                    <span className="text-muted-foreground">{new Date(r.createdAt).toLocaleDateString("fr-FR")}</span>
                    <Link href={`/admin/reservations/${r.id}`} className="text-primary hover:underline">
                      Détails
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
