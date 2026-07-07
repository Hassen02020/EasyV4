/**
 * Garde d'autorisation partagée pour le back-office Omra.
 *
 * Vérifie que l'utilisateur courant est connecté et possède un rôle éditeur
 * (super_admin / manager), et renvoie l'agencyId de son profil.
 */

import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"

const EDITOR_ROLES = new Set(["super_admin", "manager"])

/** Rôles autorisés à traiter les réservations (confirmer / annuler / compléter). */
const AGENT_ROLES = new Set(["super_admin", "manager", "agent_resa"])

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

export type OmraAgent = {
  userId: string
  agencyId: string
  role: string
  email: string
}

/**
 * Garde pour le traitement des réservations Omra (back-office).
 *
 * Autorise super_admin / manager / agent_resa et renvoie l'identité de
 * l'utilisateur (pour l'audit `actor_user_id`) + son agence.
 */
export async function requireOmraAgent(): Promise<
  OmraAgent | { error: string }
> {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Session expirée. Reconnectez-vous." }

  const profile = await getCurrentAdminProfile(user.id)
  if (!profile || !AGENT_ROLES.has(profile.role)) {
    return { error: "Accès refusé : rôle insuffisant." }
  }
  return {
    userId: profile.id,
    agencyId: profile.agencyId,
    role: profile.role,
    email: profile.email,
  }
}
