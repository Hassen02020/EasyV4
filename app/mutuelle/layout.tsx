import { redirect } from "next/navigation"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { getUserRoleFromCookie } from "@/app/actions/validate-role"
import { MutuelleShell } from "@/components/mutuelle-shell"

export const dynamic = "force-dynamic"

export default async function MutuelleLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/mutuelle/login")
  }

  // Vérification du rôle via cookie ou DB
  const cookieRole = await getUserRoleFromCookie()
  const profile = await getCurrentAdminProfile(user.id)

  // Vérifier que l'utilisateur a le bon rôle
  const allowedRoles = ["mutuelle"]
  const effectiveRole = cookieRole || profile?.role

  if (!effectiveRole || !allowedRoles.includes(effectiveRole)) {
    // Si mauvais rôle, rediriger vers le bon espace
    if (profile?.role === "super_admin" || profile?.role === "manager") {
      redirect("/admin")
    }
    if (profile?.role === "partner_owner" || profile?.role === "partner_agent") {
      redirect("/b2b")
    }
    redirect("/login/select")
  }

  return (
    <MutuelleShell
      displayName={profile?.name ?? user.email ?? "Agent Mutuelle"}
      email={user.email ?? ""}
    >
      {children}
    </MutuelleShell>
  )
}
