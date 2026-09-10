/**
 * Sign-out Supabase. Appelé par le bouton "Déconnexion" du back-office.
 * Détruit la session côté serveur (cookies) puis redirige vers /login.
 */

import { NextResponse } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { clearUserRoleCookie } from "@/app/actions/validate-role"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const supabase = await createServerSupabase()
  await supabase.auth.signOut()
  // Le cookie de rôle posé par /login/select (validateRoleAccess) survit
  // sinon à la déconnexion — un rôle resté en mémoire pourrait fausser le
  // routage du prochain utilisateur sur ce même navigateur (voir
  // getUserRoleFromCookie(), lu en priorité sur le rôle réel du profil par
  // les layouts /mutuelle, /b2b, etc.).
  await clearUserRoleCookie()

  return NextResponse.redirect(new URL("/login", request.url), {
    status: 303,
  })
}
