/**
 * Garde d'autorisation partagée pour le back-office Omra.
 *
 * Vérifie que l'utilisateur courant est connecté et possède un rôle éditeur
 * (super_admin / manager), et renvoie l'agencyId de son profil.
 */

import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"

const EDITOR_ROLES = new Set(["super_admin", "manager"])

export async function requireOmraEditor(): Promise<
  { agencyId: string } | { error: string }
> {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Session expirée. Reconnectez-vous." }

  const profile = await getCurrentAdminProfile(user.id)
  if (!profile || !EDITOR_ROLES.has(profile.role)) {
    return { error: "Accès refusé : rôle insuffisant." }
  }
  return { agencyId: profile.agencyId }
}
