/**
 * Layout pour la section /admin/suppliers
 */

import { redirect } from "next/navigation"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"

// Le shell (sidebar/header) est déjà fourni une seule fois par
// app/admin/layout.tsx — ce layout ne fait que le contrôle d'accès
// défensif à la section, comme app/admin/products/layout.tsx.
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

  return <>{children}</>
}
