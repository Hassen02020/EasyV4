/**
 * JOURNEY-BUILDER-01 — /admin/journeys : le staff choisit une agence
 * partenaire, puis compose/assiste avec EXACTEMENT le même composant que
 * /pro/journeys (`JourneysList`) — pas de deuxième Journey Builder. Même
 * garde super_admin que /admin/marges.
 */

import { redirect } from "next/navigation"
import { Route } from "lucide-react"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { withTenantContext } from "@/lib/db/tenant-context"
import { agencies } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { listMyJourneys } from "@/lib/journeys/journey-actions"
import { JourneysList } from "@/components/journeys/journeys-list"
import { AgencyPicker } from "@/components/journeys/agency-picker"

export const metadata = { title: "Journeys | Admin" }
export const dynamic = "force-dynamic"

async function getAgencies() {
  return withTenantContext(
    { agencyId: null, userId: "", isSuperAdmin: true },
    (tx) =>
      tx
        .select({ id: agencies.id, name: agencies.name })
        .from(agencies)
        .where(eq(agencies.agencyType, "partner"))
        .orderBy(agencies.name),
  )
}

export default async function AdminJourneysPage({
  searchParams,
}: {
  searchParams: Promise<{ agencyId?: string }>
}) {
  const { agencyId } = await searchParams
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login?next=/admin/journeys")

  const profile = await getCurrentAdminProfile(user.id)
  if (profile?.role !== "super_admin") redirect("/admin")

  const agenciesList = await getAgencies()
  const journeys = agencyId ? await listMyJourneys({ agencyId }) : []

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Route className="text-primary h-6 w-6" />
        <div>
          <h1 className="text-2xl font-bold">Journeys</h1>
          <p className="text-muted-foreground text-sm">
            Composez ou assistez une agence — même moteur que /pro/journeys.
          </p>
        </div>
      </div>

      <AgencyPicker agencies={agenciesList} selectedAgencyId={agencyId} />

      {agencyId ? (
        <JourneysList
          journeys={journeys}
          agencyId={agencyId}
          basePath="/admin/journeys"
        />
      ) : (
        <p className="text-muted-foreground text-sm">
          Choisissez une agence pour voir/composer ses Journeys.
        </p>
      )}
    </div>
  )
}
