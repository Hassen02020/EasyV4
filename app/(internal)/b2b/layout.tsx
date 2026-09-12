import { redirect } from "next/navigation"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { B2BShell } from "@/components/b2b-shell"

export const dynamic = "force-dynamic"

export default async function B2BLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/pro/login?next=/b2b")
  }

  const profile = await getCurrentAdminProfile(user.id)

  if (
    !profile ||
    (profile.role !== "partner_owner" && profile.role !== "partner_agent")
  ) {
    redirect("/login?next=/b2b")
  }

  return (
    <B2BShell
      agencyId={profile.agencyId}
      displayName={profile.name ?? user.email ?? "Partenaire"}
      role={profile.role}
    >
      {children}
    </B2BShell>
  )
}
