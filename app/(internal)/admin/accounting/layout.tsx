/**
 * Layout Protection Comptabilité
 *
 * Vérifie que l'utilisateur a les droits comptables avant d'afficher
 * les pages de comptabilité.
 *
 * Rôles autorisés: super_admin, manager, agent_compta
 */

import { redirect } from "next/navigation"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { canAccessSection, getForbiddenMessage } from "@/lib/auth/rbac"
import type { AdminShellRole } from "@/components/admin-shell"

export const dynamic = "force-dynamic"

export default async function AccountingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?next=/admin/accounting")
  }

  const profile = await getCurrentAdminProfile(user.id)
  const role = (profile?.role as AdminShellRole) || "manager"

  // Vérification RBAC stricte
  if (!canAccessSection(role, "accounting")) {
    redirect(`/error/403?section=accounting&from=/admin/accounting`)
  }

  // Vérification supplémentaire: seuls compta et managers peuvent voir les vraies données
  const allowedRoles = ["super_admin", "manager", "agent_compta"]
  if (!allowedRoles.includes(role)) {
    redirect(`/error/403?section=accounting&from=/admin/accounting`)
  }

  return <>{children}</>
}
