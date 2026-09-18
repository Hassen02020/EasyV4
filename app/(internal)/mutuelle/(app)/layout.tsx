import { redirect } from "next/navigation"
import { eq } from "drizzle-orm"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { getUserRoleFromCookie } from "@/app/actions/validate-role"
import { withTenantContext } from "@/lib/db/tenant-context"
import { agencies } from "@/lib/db/schema"
import { MutuelleShell } from "@/components/mutuelle-shell"

/**
 * Couleur d'accent du portail Mutuelle — mêmes colonne/mécanisme que le
 * branding White Label du storefront public (agencies.primary_color).
 * Un groupe Mutuelle (mutuelle_groups, voir schema.ts) n'a pas encore sa
 * propre couleur — le repli reste l'agence sous-jacente du compte
 * (`users.agency_id`, l'OTA directe par défaut pour un directeur/membre,
 * voir drizzle/manual/0058_mutuelle_groups.sql) tant qu'aucun chantier ne
 * demande un branding par groupe. `null` = violet par défaut inchangé
 * (voir components/mutuelle-shell.tsx).
 */
async function getMutuelleAccentColor(agencyId: string, userId: string): Promise<string | null> {
  try {
    const rows = await withTenantContext({ agencyId, userId, isSuperAdmin: false }, (tx) =>
      tx.select({ primaryColor: agencies.primaryColor }).from(agencies).where(eq(agencies.id, agencyId)).limit(1),
    )
    return rows[0]?.primaryColor ?? null
  } catch {
    return null
  }
}

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

  // Vérifier que l'utilisateur a le bon rôle — directeur ou membre d'un
  // groupe Mutuelle réel (mutuelle_groups), jamais le rôle 'mutuelle' unique
  // qui n'a jamais existé dans aucune migration Postgres (voir l'audit).
  const allowedRoles = ["mutuelle_director", "mutuelle_member"]
  const effectiveRole = cookieRole || profile?.role

  if (!effectiveRole || !allowedRoles.includes(effectiveRole) || !profile?.mutuelleGroupId) {
    // Si mauvais rôle, rediriger vers le bon espace
    if (profile?.role === "super_admin" || profile?.role === "manager") {
      redirect("/admin")
    }
    if (
      profile?.role === "partner_owner" ||
      profile?.role === "partner_agent"
    ) {
      redirect("/b2b")
    }
    redirect("/login/select")
  }

  const accentColor = profile?.agencyId
    ? await getMutuelleAccentColor(profile.agencyId, user.id)
    : null

  return (
    <MutuelleShell
      displayName={profile?.name ?? user.email ?? "Agent Mutuelle"}
      email={user.email ?? ""}
      accentColor={accentColor}
    >
      {children}
    </MutuelleShell>
  )
}
