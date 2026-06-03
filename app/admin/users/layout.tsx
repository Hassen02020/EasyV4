/**
 * Layout Protection Administration Système
 * 
 * STRICTEMENT réservé au Super Admin.
 * Gestion des utilisateurs système et des agences.
 * 
 * Rôle autorisé: super_admin UNIQUEMENT
 */

import { redirect } from "next/navigation"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import type { AdminShellRole } from "@/components/admin-shell"

export const dynamic = "force-dynamic"

export default async function AdminSystemLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?next=/admin/users")
  }

  const profile = await getCurrentAdminProfile(user.id)
  const role = (profile?.role as AdminShellRole) || "manager"

  // SEUL super_admin peut accéder
  if (role !== "super_admin") {
    redirect(`/error/403?section=admin&from=/admin/users`)
  }

  return <>{children}</>
}
