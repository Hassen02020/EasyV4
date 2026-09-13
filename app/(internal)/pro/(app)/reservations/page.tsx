import { Suspense } from "react"
import { redirect } from "next/navigation"
import { Calendar } from "lucide-react"
import { ProPageShell } from "@/components/pro/pro-page-shell"
import { PartnerReservationsTable } from "@/components/pro/partner-reservations-table"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentPartnerProfile } from "@/lib/auth/partner-profile"
import { loadPartnerReservations } from "@/lib/pro/reservations-data"
import ReservationsLoading from "./loading"

export const metadata = { title: "Mes réservations | Espace Pro Easy2Book" }

export const dynamic = "force-dynamic"

export default async function ProReservationsPage() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/pro/login?next=/pro/reservations")

  const profile = await getCurrentPartnerProfile(user.id)
  if (!profile) redirect("/pro/login")

  const { rows } = await loadPartnerReservations(profile.agency.id)

  return (
    <ProPageShell
      icon={Calendar}
      title="Mes réservations"
      description="Suivez et gérez l'ensemble des dossiers de vos clients."
    >
      <Suspense fallback={<ReservationsLoading />}>
        <PartnerReservationsTable data={rows} />
      </Suspense>
    </ProPageShell>
  )
}
