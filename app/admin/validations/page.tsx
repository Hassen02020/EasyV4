/**
 * /admin/validations — Gestion du workflow de validation des réservations
 *
 * Permet de valider, rejeter et suivre le processus de validation des réservations
 */

import { Metadata } from "next"
import { redirect } from "next/navigation"
import { Clock, CheckCircle, XCircle, FileText } from "lucide-react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ValidationsFilterableTable } from "@/components/admin/validations-filterable-table"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { withTenantContext } from "@/lib/db/tenant-context"
import { reservations, reservationValidations, customers } from "@/lib/db/schema"
import { eq, desc } from "drizzle-orm"

export const metadata: Metadata = {
  title: "Validations Réservations — Manager",
  description: "Gestion du workflow de validation des réservations",
}

export const dynamic = "force-dynamic"

export default async function ValidationsPage() {
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

  // Requête d'origine sans filtre agencyId (même bug de fuite cross-tenant
  // préexistant que app/admin/b2c/*, corrigé ici en même temps que le
  // contexte tenant) — la file de validation est celle de l'agence OTA de
  // l'admin connecté, jamais cross-tenant.
  const validationList = await withTenantContext(
    { agencyId: profile.agencyId, userId: user.id, isSuperAdmin: false },
    (db) =>
      db
        .select({
          reservation: reservations,
          validation: reservationValidations,
          customer: customers,
        })
        .from(reservations)
        .leftJoin(reservationValidations, eq(reservations.id, reservationValidations.reservationId))
        .leftJoin(customers, eq(reservations.customerId, customers.id))
        .where(eq(reservations.agencyId, profile.agencyId))
        .orderBy(desc(reservations.createdAt))
        .limit(50),
  )

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

      <ValidationsFilterableTable rows={validationList} />
    </div>
  )
}
