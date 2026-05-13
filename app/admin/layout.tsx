/**
 * Layout admin — Server Component qui :
 *  1. Vérifie la session Supabase (le middleware redirige déjà les anonymes
 *     vers /login, mais on re-vérifie ici en defense-in-depth).
 *  2. Récupère le profil utilisateur étendu (table `users`) si la BDD est
 *     configurée. À défaut, tombe sur l'email Supabase.
 *  3. Délègue le rendu à `AdminShell` (client) en lui passant les infos user.
 */

import { redirect } from "next/navigation"
import { AdminShell, type AdminShellUser } from "@/components/admin-shell"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"

export const dynamic = "force-dynamic"

function computeInitials(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return "TG"
  const parts = trimmed.split(/[\s@._-]+/).filter(Boolean)
  if (parts.length === 0) return trimmed.slice(0, 2).toUpperCase()
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?next=/admin")
  }

  const profile = await getCurrentAdminProfile(user.id)

  const email = user.email ?? "admin@tunisiago.tn"
  const displayName = profile?.name ?? email.split("@")[0] ?? "Admin"
  const shellUser: AdminShellUser = {
    email,
    displayName,
    initials: computeInitials(displayName),
    role: profile?.role ?? "manager",
  }

  return <AdminShell user={shellUser}>{children}</AdminShell>
}
