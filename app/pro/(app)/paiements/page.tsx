import { redirect } from "next/navigation"
import { CreditCard } from "lucide-react"
import { ProPageShell } from "@/components/pro/pro-page-shell"
import { PaymentsTable } from "@/components/pro/payments-table"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentPartnerProfile } from "@/lib/auth/partner-profile"
import { loadPartnerPayments } from "@/lib/pro/partner-data"

export const metadata = { title: "Mes paiements | Espace Pro Easy2Book" }

export const dynamic = "force-dynamic"

export default async function ProPaymentsPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/pro/login")

  const profile = await getCurrentPartnerProfile(user.id)
  if (!profile) redirect("/pro/login")

  const rows = await loadPartnerPayments(profile.agency.id)

  return (
    <ProPageShell
      icon={CreditCard}
      title="Mes paiements"
      description="Historique de vos demandes de recharge wallet."
      iconTone="accent"
    >
      <PaymentsTable rows={rows} />
    </ProPageShell>
  )
}
