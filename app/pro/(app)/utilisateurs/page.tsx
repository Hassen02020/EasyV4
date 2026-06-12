import { redirect } from "next/navigation"
import { Users } from "lucide-react"
import { ProPageShell } from "@/components/pro/pro-page-shell"
import { UsersManager } from "@/components/pro/users-manager"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentPartnerProfile } from "@/lib/auth/partner-profile"
import { loadPartnerUsers } from "@/lib/pro/users-data"

export const metadata = { title: "Utilisateurs | Espace Pro Easy2Book" }

export const dynamic = "force-dynamic"

export default async function ProUsersPage() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/pro/login?next=/pro/utilisateurs")

  const profile = await getCurrentPartnerProfile(user.id)
  if (!profile) redirect("/pro/login")

  const initial = await loadPartnerUsers(profile.agency.id)

  return (
    <ProPageShell
      icon={Users}
      title="Utilisateurs de l'agence"
      iconTone="secondary"
      description="Invitez vos collaborateurs et gérez leurs accès au portail Pro."
    >
      <UsersManager initial={initial} maxAgents={5} />
    </ProPageShell>
  )
}
