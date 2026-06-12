/**
 * Gestion des Agences — Super Admin uniquement
 *
 * CRUD des agences partenaires B2B et OTA
 */

import { Suspense } from "react"
import { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Building, Plus, Building2, CheckCircle2, DollarSign } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { getDb } from "@/lib/db/client"
import { agencies, users } from "@/lib/db/schema"
import { desc, count } from "drizzle-orm"
import { logger } from "@/lib/logger"
import { AgenciesDataTable } from "@/components/admin/agencies-data-table"
import AgenciesLoading from "./loading"

export const metadata: Metadata = {
  title: "Gestion Agences — Super Admin",
  description: "Administration des agences partenaires",
}

export const dynamic = "force-dynamic"


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
    logger.error("[loadAgencies] failed", { err: error instanceof Error ? error.message : String(error) })
    return []
  }
}

export default async function AgenciesManagementPage() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?next=/admin/agencies")
  }

  const profile = await getCurrentAdminProfile(user.id)

  if (profile?.role !== "super_admin") {
    redirect("/admin")
  }

  const allAgencies = await loadAgencies()

  const otaCount = allAgencies.filter((a) => a.agencyType === "ota").length
  const partnerCount = allAgencies.filter(
    (a) => a.agencyType === "partner",
  ).length
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
            Administration des agences OTA et partenaires B2B —{" "}
            {allAgencies.length} agence{allAgencies.length !== 1 ? "s" : ""}
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
            <CheckCircle2 className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{otaCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Partenaires B2B
            </CardTitle>
            <Building2 className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{partnerCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Solde Global B2B
            </CardTitle>
            <DollarSign className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {totalBalance.toLocaleString("fr-FR", {
                minimumFractionDigits: 3,
              })}{" "}
              DT
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Agencies DataTable */}
      <Card>
        <CardContent className="pt-6">
          <Suspense fallback={<AgenciesLoading />}>
            <AgenciesDataTable data={allAgencies} />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  )
}
