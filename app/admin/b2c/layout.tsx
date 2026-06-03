/**
 * Layout Protection B2C (Réservations & Clients)
 * 
 * Vérifie que l'utilisateur peut accéder aux fonctionnalités B2C.
 * 
 * Rôles autorisés: super_admin, manager, agent_resa, agent_compta (lecture)
 * Agent excursions peut voir uniquement les réservations de type excursion.
 */

import { redirect } from "next/navigation"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { canAccessSection, hasPermission } from "@/lib/auth/rbac"
import type { AdminShellRole } from "@/components/admin-shell"

export const dynamic = "force-dynamic"

export default async function B2CLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?next=/admin/b2c")
  }

  const profile = await getCurrentAdminProfile(user.id)
  const role = (profile?.role as AdminShellRole) || "manager"

  // Vérification RBAC: besoin de reservations.view OU clients.view
  const hasB2CAccess = hasPermission(role, "reservations.view") || hasPermission(role, "clients.view")
  
  if (!hasB2CAccess) {
    redirect(`/error/403?section=b2c&from=/admin/b2c`)
  }

  // Pour agent_excursions, on pourrait injecter un contexte spécial
  // pour filtrer uniquement les réservations de type excursion
  // (non implémenté ici, géré côté composants)

  return <>{children}</>
}
