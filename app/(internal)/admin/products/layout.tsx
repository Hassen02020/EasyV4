/**
 * Layout Protection Catalogue Produits
 *
 * Vérifie que l'utilisateur peut accéder au catalogue.
 *
 * Rôles autorisés: super_admin, manager, agent_resa (lecture), agent_excursions (modif excursions)
 */

import { redirect } from "next/navigation"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { canAccessSection, hasPermission } from "@/lib/auth/rbac"
import type { AdminShellRole } from "@/components/admin-shell"

export const dynamic = "force-dynamic"

export default async function ProductsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?next=/admin/products")
  }

  const profile = await getCurrentAdminProfile(user.id)
  const role = (profile?.role as AdminShellRole) || "manager"

  // Vérification RBAC: besoin de products.view
  if (!canAccessSection(role, "products")) {
    redirect(`/error/403?section=products&from=/admin/products`)
  }

  // Agent excursions peut modifier les produits de type excursion
  // (filtrage côté composant)

  return <>{children}</>
}
