/**
 * Sign-out Supabase. Appelé par le bouton "Déconnexion" du back-office.
 * Détruit la session côté serveur (cookies) puis redirige vers /login.
 */

import { NextResponse } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const supabase = await createServerSupabase()
  await supabase.auth.signOut()

  return NextResponse.redirect(new URL("/login", request.url), {
    status: 303,
  })
}
