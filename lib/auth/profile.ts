/**
 * Récupère le profil étendu d'un utilisateur du back-office (table `users`).
 *
 * - Si la BDD n'est pas configurée (DATABASE_URL manquant) ou si l'utilisateur
 *   n'a pas encore d'entrée dans `users`, on retourne `null`. L'appelant doit
 *   alors tomber sur les infos minimales fournies par Supabase Auth (email).
 * - Cette fonction est volontairement défensive : un échec de DB ne doit JAMAIS
 *   empêcher l'accès à l'admin pour un user valide Supabase.
 *
 * Passe par `resolve_session_context()` (SQL SECURITY DEFINER, voir
 * drizzle/manual/0012_rls_session_context.sql) plutôt qu'un SELECT direct sur
 * `users` : notre connexion Drizzle est directe (postgres-js), pas derrière
 * PostgREST, donc `auth.uid()` n'y résout jamais et la policy RLS
 * `users_select` (agency_id = current_agency_id() OR id = auth.uid() OR
 * is_super_admin()) bloquait systématiquement ce self-lookup avant que le
 * contexte tenant ne soit posé — poule-et-œuf identique à celui résolu dans
 * lib/db/tenant-context.ts::resolveSessionContext().
 */

import { sql } from "drizzle-orm"

import { getDb } from "@/lib/db/client"

export type AdminProfile = {
  id: string
  agencyId: string
  /** 'ota' = staff Easy2Book · 'partner' = agence B2B. Ne jamais admettre un
   * profil 'partner' dans /admin, même si son rôle ressemble à un rôle staff
   * (manager/agent_resa/etc. sont partagés entre les deux types d'agence). */
  agencyType: "ota" | "partner"
  email: string
  name: string | null
  role:
    | "super_admin"
    | "manager"
    | "agent_resa"
    | "agent_compta"
    | "agent_excursions"
    | "partner_owner"
    | "partner_agent"
  status: "active" | "suspended"
}

export async function getCurrentAdminProfile(
  userId: string,
): Promise<AdminProfile | null> {
  if (!userId) return null
  if (!process.env.DATABASE_URL) return null

  try {
    const db = getDb()
    const rows = (await db.execute(
      sql`select * from resolve_session_context(${userId}::uuid)`,
    )) as Array<{
      agency_id: string | null
      role: AdminProfile["role"] | null
      status: AdminProfile["status"] | null
      email: string | null
      name: string | null
      agency_type: AdminProfile["agencyType"] | null
    }>

    const profile = rows[0]
    if (
      !profile ||
      !profile.agency_id ||
      !profile.role ||
      !profile.status ||
      !profile.agency_type
    ) {
      return null
    }
    // Compte désactivé (Phase 18 — user management) : même règle que
    // lib/auth/partner-profile.ts::getCurrentPartnerProfile, qui l'appliquait
    // déjà côté /pro. Sans ce filtre, suspendre un membre du staff Easy2Book
    // via `users.status` n'avait aucun effet réel côté /admin — l'utilisateur
    // restait connecté et pleinement actif malgré la suspension affichée.
    if (profile.status !== "active") {
      return null
    }

    return {
      id: userId,
      agencyId: profile.agency_id,
      agencyType: profile.agency_type,
      email: profile.email ?? "",
      name: profile.name,
      role: profile.role,
      status: profile.status,
    }
  } catch (error) {
    const { logger } = await import("@/lib/logger")
    logger.warn("[getCurrentAdminProfile] DB lookup failed — fallback to Supabase auth", {
      code: error instanceof Error ? error.constructor.name : "unknown",
    })
    return null
  }
}
