/**
 * Garde d'authentification pour les API Routes Next.js.
 *
 * Utilisation dans un route handler :
 *   const session = await requirePartnerSession(req)
 *   if (session instanceof NextResponse) return session  // 401
 *   const { agencyId, userId, role } = session
 *
 * Vérifie :
 *   1. Présence d'un token Bearer (Authorization header) ou cookie de session Supabase
 *   2. Token valide côté Supabase (getUser)
 *   3. Utilisateur actif en DB avec rôle autorisé
 *
 * Retourne un `NextResponse` 401 si l'accès est refusé,
 * ou les données de session si l'accès est accordé.
 */

import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { eq } from "drizzle-orm"
import { getDb } from "@/lib/db/client"
import { users } from "@/lib/db/schema"

export interface PartnerSession {
  userId: string
  agencyId: string
  role: "super_admin" | "manager" | "agent_resa"
  email: string
}

/**
 * Extrait et valide la session partenaire depuis la requête.
 *
 * @returns `PartnerSession` si authentifié et autorisé
 * @returns `NextResponse` (401/403) si accès refusé
 */
export async function requirePartnerSession(
  req: NextRequest,
  allowedRoles: PartnerSession["role"][] = ["super_admin", "manager", "agent_resa"],
): Promise<PartnerSession | NextResponse> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    return NextResponse.json(
      { error: "server_misconfigured" },
      { status: 500 },
    )
  }

  // Construire un client Supabase à partir des cookies de la requête (SSR)
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll()
      },
      setAll() {
        // Route handler — on ne peut pas écrire les cookies en lecture seule ici
      },
    },
  })

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return NextResponse.json(
      { error: "unauthorized", message: "Session invalide ou expirée" },
      { status: 401 },
    )
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "db_unavailable" }, { status: 503 })
  }

  const db = getDb()
  const [row] = await db
    .select({
      agencyId: users.agencyId,
      role: users.role,
      status: users.status,
    })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1)

  if (!row) {
    return NextResponse.json(
      { error: "user_not_found", message: "Utilisateur introuvable en base" },
      { status: 401 },
    )
  }

  if (row.status !== "active") {
    return NextResponse.json(
      { error: "account_suspended", message: "Compte suspendu" },
      { status: 403 },
    )
  }

  if (!allowedRoles.includes(row.role as PartnerSession["role"])) {
    return NextResponse.json(
      { error: "forbidden", message: "Rôle insuffisant" },
      { status: 403 },
    )
  }

  return {
    userId: user.id,
    agencyId: row.agencyId,
    role: row.role as PartnerSession["role"],
    email: user.email ?? "",
  }
}
