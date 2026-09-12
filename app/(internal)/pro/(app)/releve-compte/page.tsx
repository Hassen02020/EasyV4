import { redirect } from "next/navigation"
import { ScrollText } from "lucide-react"
import { ProPageShell } from "@/components/pro/pro-page-shell"
import { LedgerReport } from "@/components/pro/ledger-report"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentPartnerProfile } from "@/lib/auth/partner-profile"
import { loadPartnerLedger } from "@/lib/pro/partner-data"

export const metadata = { title: "Relevé de compte | Espace Pro Easy2Book" }

export const dynamic = "force-dynamic"

export default async function ProReleveComptePage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/pro/login")

  const profile = await getCurrentPartnerProfile(user.id)
  if (!profile) redirect("/pro/login")

  const { rows, currentBalance } = await loadPartnerLedger(profile.agency.id)

  return (
    <ProPageShell
      icon={ScrollText}
      title="Relevé de compte"
      description="Générez un rapport détaillé débits / crédits sur une période."
      iconTone="secondary"
    >
      <LedgerReport rows={rows} currentBalance={currentBalance} />
    </ProPageShell>
  )
}
