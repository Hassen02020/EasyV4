/**
 * JOURNEY-BUILDER-01 — /pro/journeys/[id] : composition + confirmation
 * ligne par ligne. `getJourney` est scopé par RLS (agence de la session
 * uniquement) — un id d'un autre agence retourne `null`, jamais une fuite.
 */

import { notFound, redirect } from "next/navigation"
import { Route } from "lucide-react"
import { ProPageShell } from "@/components/pro/pro-page-shell"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentPartnerProfile } from "@/lib/auth/partner-profile"
import { getJourney } from "@/lib/journeys/journey-actions"
import { JourneyComposer } from "@/components/journeys/journey-composer"

export const metadata = { title: "Journey | Espace Pro Easy2Book" }
export const dynamic = "force-dynamic"

export default async function ProJourneyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/pro/login")

  const profile = await getCurrentPartnerProfile(user.id)
  if (!profile) redirect("/pro/login")

  const data = await getJourney({ journeyId: id })
  if (!data) notFound()

  return (
    <ProPageShell icon={Route} title="Journey" iconTone="accent" description="Composition et confirmation ligne par ligne.">
      <JourneyComposer journey={data.journey} lines={data.lines} />
    </ProPageShell>
  )
}
