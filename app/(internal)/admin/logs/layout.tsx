/**
 * Layout Protection Logs Système
 *
 * STRICTEMENT réservé au Super Admin.
 * Audit des actions et monitoring système.
 *
 * Rôle autorisé: super_admin UNIQUEMENT
 */

import { redirect } from "next/navigation"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import type { AdminShellRole } from "@/components/admin-shell"

export const dynamic = "force-dynamic"

export default async function LogsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?next=/admin/logs")
  }

  const profile = await getCurrentAdminProfile(user.id)
  const role = (profile?.role as AdminShellRole) || "manager"

  // SEUL super_admin peut accéder aux logs système
  if (role !== "super_admin") {
    redirect(`/error/403?section=admin&from=/admin/logs`)
  }

  return <>{children}</>
}
