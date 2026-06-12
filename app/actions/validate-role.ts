"use server"

import { cookies } from "next/headers"
import { eq, and } from "drizzle-orm"
import { getDb } from "@/lib/db/client"
import { users } from "@/lib/db/schema"
import { createServerSupabase } from "@/lib/supabase/server"

export type ValidateRoleInput = {
  email: string
  password: string
  role: string
}

export type ValidateRoleResult =
  | { ok: true; userId: string; role: string; redirectTo: string }
  | { ok: false; message: string }

const ROLE_REDIRECTS: Record<string, string> = {
  super_admin: "/admin",
  admin: "/admin",
  manager: "/admin",
  agent_resa: "/admin",
  agent_compta: "/admin",
  agent_excursions: "/admin",
  partner_owner: "/b2b",
  partner_agent: "/b2b",
  mutuelle: "/mutuelle",
}

/**
 * Server Action: Valide les credentials et vérifie que l'utilisateur
 * a bien le rôle demandé. Stocke le rôle dans un cookie pour le middleware.
 */
export async function validateRoleAccess(
  input: ValidateRoleInput,
): Promise<ValidateRoleResult> {
  const { email, password, role } = input

  if (!email || !password || !role) {
    return { ok: false, message: "Tous les champs sont requis" }
  }

  try {
    // 1. Authentification Supabase
    const supabase = await createServerSupabase()
    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({
        email: email.toLowerCase().trim(),
        password,
      })

    if (authError || !authData.user) {
      return {
        ok: false,
        message: "Email ou mot de passe incorrect",
      }
    }

    const userId = authData.user.id

    // 2. Vérification du rôle en base de données
    if (!process.env.DATABASE_URL) {
      // Mode sans DB: on accepte l'auth Supabase sans vérifier le rôle
      // mais on redirige quand même selon le rôle demandé (démo)
      const redirectTo = ROLE_REDIRECTS[role] || "/"

      // Stocker le rôle dans un cookie pour le middleware
      const cookieStore = await cookies()
      cookieStore.set("user_role", role, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24, // 24h
        path: "/",
      })

      return { ok: true, userId, role, redirectTo }
    }

    // Avec DB: vérifier que le rôle correspond
    const db = getDb()
    const userRows = await db
      .select({
        id: users.id,
        role: users.role,
        status: users.status,
        agencyId: users.agencyId,
      })
      .from(users)
      .where(
        and(eq(users.id, userId), eq(users.email, email.toLowerCase().trim())),
      )
      .limit(1)

    const dbUser = userRows[0]

    if (!dbUser) {
      return {
        ok: false,
        message: "Utilisateur non trouvé dans la base de données",
      }
    }

    if (dbUser.status === "suspended") {
      return {
        ok: false,
        message: "Compte suspendu. Contactez l'administrateur.",
      }
    }

    // Mapping des rôles demandés vers les rôles DB
    const roleMapping: Record<string, string[]> = {
      super_admin: ["super_admin"],
      admin: ["manager", "agent_resa", "agent_compta", "agent_excursions"],
      partner: ["partner_owner", "partner_agent"],
      mutuelle: ["mutuelle"],
    }

    const allowedRoles = roleMapping[role] || [role]

    if (!allowedRoles.includes(dbUser.role)) {
      return {
        ok: false,
        message: `Accès refusé. Votre rôle (${dbUser.role}) ne correspond pas à ${role}.`,
      }
    }

    // 3. Stocker le rôle dans un cookie pour le middleware
    const cookieStore = await cookies()
    cookieStore.set("user_role", dbUser.role, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24, // 24h
      path: "/",
    })

    // 4. Déterminer la redirection
    const redirectTo = ROLE_REDIRECTS[dbUser.role] || "/"

    return {
      ok: true,
      userId,
      role: dbUser.role,
      redirectTo,
    }
  } catch (error) {
    console.error("[validateRoleAccess]", error)
    return {
      ok: false,
      message: "Erreur technique. Veuillez réessayer.",
    }
  }
}

/**
 * Récupère le rôle depuis le cookie (utilisé par les layouts serveur)
 */
export async function getUserRoleFromCookie(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get("user_role")?.value ?? null
}

/**
 * Déconnexion: supprime le cookie de rôle
 */
export async function clearUserRoleCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete("user_role")
}
