/**
 * Gestion des groupes Mutuelle — Super Admin uniquement
 *
 * Chantier "Mutuelle" (fondation données) — voir
 * docs/audits/architecture-vision-audit.md et
 * drizzle/manual/0058_mutuelle_groups.sql. Une Mutuelle est un distributeur
 * privé B2B2C, pas une agence : identité + convention (markup, agence
 * d'exécution) ici ; catalogue autorisé, application du markup et workflow
 * de validation membre→directeur→agence sont des chantiers suivants.
 */

import { Suspense } from "react"
import { Metadata } from "next"
import { redirect } from "next/navigation"
import { HeartHandshake, Building2, Users, Percent } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { withTenantContext } from "@/lib/db/tenant-context"
import { agencies } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { listMutuelleGroups } from "@/lib/admin/mutuelle-groups-actions"
import { MutuelleGroupsDataTable } from "@/components/admin/mutuelle-groups-data-table"

export const metadata: Metadata = {
  title: "Groupes Mutuelle — Super Admin",
  description: "Administration des distributeurs privés B2B2C",
}

export const dynamic = "force-dynamic"

async function loadAgencyOptions(userId: string) {
  try {
    return await withTenantContext({ agencyId: null, userId, isSuperAdmin: true }, (tx) =>
      tx
        .select({ id: agencies.id, name: agencies.name })
        .from(agencies)
        .where(eq(agencies.status, "active"))
        .orderBy(agencies.name),
    )
  } catch {
    return []
  }
}

export default async function MutuelleGroupsPage() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login?next=/admin/mutuelle")

  const profile = await getCurrentAdminProfile(user.id)
  if (profile?.role !== "super_admin") redirect("/admin")

  const [groups, agencyOptions] = await Promise.all([
    listMutuelleGroups(),
    loadAgencyOptions(user.id),
  ])

  const activeCount = groups.filter((g) => g.status === "active").length
  const totalMembers = groups.reduce((sum, g) => sum + g.memberCount, 0)
  const avgMarkup =
    groups.length > 0 ? groups.reduce((sum, g) => sum + g.markupPercent, 0) / groups.length : 0

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-foreground text-3xl font-bold tracking-tight">
            Groupes Mutuelle
          </h1>
          <p className="text-muted-foreground mt-1">
            Distributeurs privés B2B2C — {groups.length} groupe{groups.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Groupes</CardTitle>
            <HeartHandshake className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{groups.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Actifs</CardTitle>
            <Building2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{activeCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Membres</CardTitle>
            <Users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalMembers}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Markup Moyen</CardTitle>
            <Percent className="h-4 w-4 text-violet-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{avgMarkup.toFixed(1)}%</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Suspense>
            <MutuelleGroupsDataTable data={groups} agencyOptions={agencyOptions} />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  )
}
