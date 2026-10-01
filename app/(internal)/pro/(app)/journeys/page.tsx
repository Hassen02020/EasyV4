/**
 * JOURNEY-BUILDER-01 — /pro/journeys : composition B2B multi-produits pour
 * l'agence connectée. Réutilise `listMyJourneys`/`JourneysList` sans
 * agencyId explicite — résolu depuis la session (jamais fourni par le
 * client, voir lib/journeys/journey-actions.ts).
 */

import { Route } from "lucide-react"
import { redirect } from "next/navigation"
import { ProPageShell } from "@/components/pro/pro-page-shell"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentPartnerProfile } from "@/lib/auth/partner-profile"
import { listMyJourneys } from "@/lib/journeys/journey-actions"
import { JourneysList } from "@/components/journeys/journeys-list"

export const metadata = { title: "Journeys | Espace Pro Easy2Book" }

export const dynamic = "force-dynamic"

export default async function ProJourneysPage() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/pro/login")

  const profile = await getCurrentPartnerProfile(user.id)
  if (!profile) redirect("/pro/login")

  const journeys = await listMyJourneys()

  return (
    <ProPageShell
      icon={Route}
      title="Journeys"
      iconTone="accent"
      description="Composez une offre multi-produits pour votre client, puis confirmez chaque réservation."
    >
      <JourneysList journeys={journeys} basePath="/pro/journeys" />
    </ProPageShell>
  )
}
