import { redirect } from "next/navigation"
import { Users } from "lucide-react"
import { ProPageShell } from "@/components/pro/pro-page-shell"
import { UsersManager } from "@/components/pro/users-manager"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentPartnerProfile } from "@/lib/auth/partner-profile"
import { loadPartnerUsers } from "@/lib/pro/users-data"
import {
  getAgencyPermissionGrants,
  getBaselinePermissions,
  getEffectivePermission,
  PARTNER_DELEGATABLE_PERMISSIONS,
} from "@/lib/auth/permissions"

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

  // Consultation ouverte aux 3 rôles /pro valides (owner, agent, super_admin
  // en vue B2B simulée) — même scope RLS agence, "pas de partition par
  // agent" (Phase 22) : la différence owner/agent est OPÉRATIONNELLE, pas
  // de visibilité, donc l'agent peut voir cette page (lecture seule). La
  // gestion fine (statut, délégation) est en plus conditionnée au grant
  // explicite "staff.edit" (Phase 22/23) — jamais automatique du seul rôle
  // owner, voir `canManage` plus bas.
  const isValidPartnerRole =
    profile.role === "partner_owner" || profile.role === "partner_agent" || profile.role === "super_admin"
  if (!isValidPartnerRole) {
    redirect("/pro?forbidden=utilisateurs")
  }

  const initial = await loadPartnerUsers(profile.agency.id)

  const isOwner = profile.role === "partner_owner"
  const canManage =
    isOwner &&
    (await getEffectivePermission({
      agencyId: profile.agency.id,
      userId: profile.userId,
      role: "partner_owner",
      permission: "staff.edit",
    }))

  const agentIds = initial.filter((u) => u.role === "partner_agent").map((u) => u.id)
  const grantsByUser = canManage
    ? await getAgencyPermissionGrants(profile.agency.id, agentIds)
    : new Map<string, { permission: (typeof PARTNER_DELEGATABLE_PERMISSIONS)[number]; granted: boolean }[]>()

  return (
    <ProPageShell
      icon={Users}
      title="Utilisateurs de l'agence"
      iconTone="secondary"
      description={
        canManage
          ? "Gérez le statut de vos agents et déléguez-leur des permissions."
          : "Consultez les collaborateurs de votre agence."
      }
    >
      <UsersManager
        initial={initial}
        canManage={canManage}
        currentUserId={profile.userId}
        delegatablePermissions={PARTNER_DELEGATABLE_PERMISSIONS}
        agentBaseline={getBaselinePermissions("partner_agent")}
        grantsByUser={Object.fromEntries(grantsByUser)}
      />
    </ProPageShell>
  )
}
