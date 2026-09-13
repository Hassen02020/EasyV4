/**
 * Layout Protection Gestion du Personnel
 *
 * STRICTEMENT réservé aux Managers et Super Admin.
 * Les agents ne peuvent pas voir/modifier les autres agents.
 *
 * Rôles autorisés: super_admin, manager
 */

import { redirect } from "next/navigation"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { canAccessSection } from "@/lib/auth/rbac"
import type { AdminShellRole } from "@/components/admin-shell"

export const dynamic = "force-dynamic"

export default async function StaffLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?next=/admin/staff")
  }

  const profile = await getCurrentAdminProfile(user.id)
  const role = (profile?.role as AdminShellRole) || "manager"

  // SEULS manager et super_admin peuvent accéder
  const allowedRoles = ["super_admin", "manager"]

  if (!allowedRoles.includes(role)) {
    redirect(`/error/403?section=staff&from=/admin/staff`)
  }

  // Double vérification RBAC
  if (!canAccessSection(role, "staff")) {
    redirect(`/error/403?section=staff&from=/admin/staff`)
  }

  return <>{children}</>
}
