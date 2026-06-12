/**
 * Récupère le profil étendu d'un utilisateur du back-office (table `users`).
 *
 * - Si la BDD n'est pas configurée (DATABASE_URL manquant) ou si l'utilisateur
 *   n'a pas encore d'entrée dans `users`, on retourne `null`. L'appelant doit
 *   alors tomber sur les infos minimales fournies par Supabase Auth (email).
 * - Cette fonction est volontairement défensive : un échec de DB ne doit JAMAIS
 *   empêcher l'accès à l'admin pour un user valide Supabase.
 */

import { eq } from "drizzle-orm"

import { getDb } from "@/lib/db/client"
import { users } from "@/lib/db/schema"

export type AdminProfile = {
  id: string
  agencyId: string
  email: string
  name: string | null
  role:
    | "super_admin"
    | "manager"
    | "agent_resa"
    | "agent_compta"
    | "agent_excursions"
  status: "active" | "suspended"
}

export async function getCurrentAdminProfile(
  userId: string,
): Promise<AdminProfile | null> {
  if (!userId) return null
  if (!process.env.DATABASE_URL) return null

  try {
    const db = getDb()
    const rows = await db
      .select({
        id: users.id,
        agencyId: users.agencyId,
        email: users.email,
        name: users.name,
        role: users.role,
        status: users.status,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)

    const profile = rows[0]
    if (!profile) return null

    return {
      id: profile.id,
      agencyId: profile.agencyId,
      email: profile.email,
      name: profile.name,
      role: profile.role,
      status: profile.status,
    }
  } catch (error) {
    console.warn(
      "[getCurrentAdminProfile] DB lookup failed, falling back to Supabase Auth only:",
      error instanceof Error ? error.message : error,
    )
    return null
  }
}
