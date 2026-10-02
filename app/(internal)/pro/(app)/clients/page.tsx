import { redirect } from "next/navigation"
import { Users } from "lucide-react"
import { ProPageShell } from "@/components/pro/pro-page-shell"
import { ClientsTable } from "@/components/pro/clients-table"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentPartnerProfile } from "@/lib/auth/partner-profile"
import { loadPartnerClients } from "@/lib/pro/partner-data"
import { getEffectivePermission } from "@/lib/auth/permissions"

export const metadata = { title: "Mes clients | Espace Pro Easy2Book" }

export const dynamic = "force-dynamic"

export default async function ProClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/pro/login")

  const profile = await getCurrentPartnerProfile(user.id)
  if (!profile) redirect("/pro/login")

  const { q } = await searchParams
  const rows = await loadPartnerClients(profile.agency.id, q)

  // R3-01 : "clients.create"/"clients.edit" sont dans la baseline
  // partner_owner (lib/auth/permissions.ts) et délégables à un
  // partner_agent — getEffectivePermission combine déjà override puis
  // baseline, donc un seul appel couvre les deux rôles.
  const [canCreate, canEdit] = await Promise.all([
    getEffectivePermission({
      agencyId: profile.agency.id,
      userId: profile.userId,
      role: profile.role,
      permission: "clients.create",
    }),
    getEffectivePermission({
      agencyId: profile.agency.id,
      userId: profile.userId,
      role: profile.role,
      permission: "clients.edit",
    }),
  ])

  return (
    <ProPageShell
      icon={Users}
      title="Mes clients"
      description="Annuaire des clients finaux liés aux dossiers de votre agence."
      iconTone="secondary"
    >
      <ClientsTable rows={rows} canCreate={canCreate} canEdit={canEdit} />
    </ProPageShell>
  )
}
