import { redirect } from "next/navigation"
import { Users } from "lucide-react"
import { ProPageShell } from "@/components/pro/pro-page-shell"
import { UsersManager } from "@/components/pro/users-manager"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentPartnerProfile } from "@/lib/auth/partner-profile"
import { canManagePartnerUsers } from "@/lib/auth/partner-permissions"
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

  // "Droits owner" (voir EASYV4_DEEP_AUDIT_REPORT.md / modèle B2C < Partner
  // Agent < Partner Owner < Admin OTA) : la gestion des collaborateurs de
  // l'agence (inviter/activer/supprimer) est réservée au owner. Avant ce
  // correctif, un `partner_agent` atterrissait sur la même page sans aucune
  // vérification — même si l'action "Inviter" reste un mock frontend pour
  // l'instant (aucune écriture DB), cette porte doit exister dès maintenant
  // pour ne pas être oubliée le jour où l'invitation sera branchée en vrai.
  // `super_admin` conservé pour le mode "vue B2B simulée" (cohérent avec le
  // reste de /pro, voir app/pro/(app)/layout.tsx).
  if (!canManagePartnerUsers(profile.role)) {
    redirect("/pro?forbidden=utilisateurs")
  }

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
