/**
 * Layout pour la section /admin/suppliers
 */

import { redirect } from "next/navigation"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { AdminShell, type AdminShellUser } from "@/components/admin-shell"

export default async function SuppliersLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?next=/admin/suppliers")
  }

  const profile = await getCurrentAdminProfile(user.id)
  const allowedRoles = ["super_admin", "manager"]
  if (!profile || !allowedRoles.includes(profile.role)) {
    redirect("/admin")
  }

  const adminUser: AdminShellUser = {
    email: user.email || "",
    displayName: profile.name || user.email || "",
    initials: (profile.name || user.email || "").slice(0, 2).toUpperCase(),
    role: profile.role as any,
  }

  return <AdminShell user={adminUser}>{children}</AdminShell>
}
