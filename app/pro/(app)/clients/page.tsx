import { redirect } from "next/navigation"
import { Users } from "lucide-react"
import { ProPageShell } from "@/components/pro/pro-page-shell"
import { ClientsTable } from "@/components/pro/clients-table"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentPartnerProfile } from "@/lib/auth/partner-profile"
import { loadPartnerClients } from "@/lib/pro/partner-data"

export const metadata = { title: "Mes clients | Espace Pro Easy2Book" }

export const dynamic = "force-dynamic"

export default async function ProClientsPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/pro/login")

  const profile = await getCurrentPartnerProfile(user.id)
  if (!profile) redirect("/pro/login")

  const rows = await loadPartnerClients(profile.agency.id)

  return (
    <ProPageShell
      icon={Users}
      title="Mes clients"
      description="Annuaire des clients finaux liés aux dossiers de votre agence."
      iconTone="secondary"
    >
      <ClientsTable rows={rows} />
    </ProPageShell>
  )
}
