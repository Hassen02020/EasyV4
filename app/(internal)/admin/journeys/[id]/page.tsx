/**
 * JOURNEY-BUILDER-01 — /admin/journeys/[id] : même composeur que /pro
 * (`JourneyComposer`). `getJourney` n'a pas besoin d'agencyId ici — le
 * Journey ciblé par `id` fixe déjà son agence, `isSuperAdmin` contourne la
 * RLS (voir lib/journeys/journey-actions.ts::resolveActorForExistingRecord).
 */

import { notFound, redirect } from "next/navigation"
import { Route } from "lucide-react"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { getJourney } from "@/lib/journeys/journey-actions"
import { JourneyComposer } from "@/components/journeys/journey-composer"

export const metadata = { title: "Journey | Admin" }
export const dynamic = "force-dynamic"

export default async function AdminJourneyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login?next=/admin/journeys")

  const profile = await getCurrentAdminProfile(user.id)
  if (profile?.role !== "super_admin") redirect("/admin")

  const data = await getJourney({ journeyId: id })
  if (!data) notFound()

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Route className="text-primary h-6 w-6" />
        <h1 className="text-2xl font-bold">Journey</h1>
      </div>
      <JourneyComposer journey={data.journey} lines={data.lines} />
    </div>
  )
}
