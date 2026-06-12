/**
 * assertAgencyAccess — Easy2Book
 *
 * Vérifie que l'utilisateur authentifié est autorisé à agir sur une agence.
 * À appeler en début de chaque Server Action qui manipule des données d'agence.
 *
 * Règles :
 *  - Un utilisateur de type "partner" ne peut agir QUE sur sa propre agence.
 *  - Un "super_admin" / "admin" peut agir sur toutes les agences.
 *  - Tout autre cas → UnauthorizedError (équivalent 403).
 */

import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import { getCurrentAdminProfile } from "./profile"

export class UnauthorizedError extends Error {
  readonly code = "UNAUTHORIZED"
  constructor(message = "Accès non autorisé.") {
    super(message)
    this.name = "UnauthorizedError"
  }
}

async function getSupabaseUserId(): Promise<string | null> {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: () => {},
        },
      },
    )
    const { data } = await supabase.auth.getUser()
    return data.user?.id ?? null
  } catch {
    return null
  }
}

/**
 * Lance une `UnauthorizedError` si l'utilisateur n'est pas autorisé
 * à effectuer des opérations sur `agencyId`.
 *
 * Usage dans une Server Action :
 * ```ts
 * export async function someAction(input: Input) {
 *   await assertAgencyAccess(input.agencyId)
 *   // ... logique métier
 * }
 * ```
 */
export async function assertAgencyAccess(agencyId: string): Promise<void> {
  const userId = await getSupabaseUserId()
  if (!userId) {
    throw new UnauthorizedError("Vous devez être connecté pour effectuer cette action.")
  }

  const profile = await getCurrentAdminProfile(userId)
  if (!profile) {
    throw new UnauthorizedError("Profil utilisateur introuvable.")
  }

  // Super admins et managers internes ont accès à toutes les agences
  if (profile.role === "super_admin" || profile.role === "manager") return

  // Les partenaires ne peuvent agir que sur leur propre agence
  if (profile.agencyId === agencyId) return

  throw new UnauthorizedError(
    `Vous n'êtes pas autorisé à effectuer des opérations sur l'agence ${agencyId}.`,
  )
}

/**
 * Version sans throw — retourne un booléen.
 * Utile pour les guards UI.
 */
export async function canAccessAgency(agencyId: string): Promise<boolean> {
  try {
    await assertAgencyAccess(agencyId)
    return true
  } catch {
    return false
  }
}
