/**
 * Auth callback Supabase — utilisé par :
 *  - magic-link OTP (`signInWithOtp({ emailRedirectTo: '/api/auth/callback' })`)
 *  - confirmation email après création de compte
 *  - OAuth providers (Google, etc., quand activés)
 *
 * Échange le `code` query param contre une session côté serveur, pose les
 * cookies via `@supabase/ssr`, puis redirige vers `next` (ou `/admin` par défaut).
 */

import { NextResponse, type NextRequest } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const nextRaw = url.searchParams.get("next") ?? "/admin"
  const next = nextRaw.startsWith("/") ? nextRaw : "/admin"

  if (!code) {
    const loginUrl = new URL("/login", url.origin)
    loginUrl.searchParams.set("error", "missing_code")
    return NextResponse.redirect(loginUrl)
  }

  const supabase = await createServerSupabase()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    const loginUrl = new URL("/login", url.origin)
    loginUrl.searchParams.set("error", "exchange_failed")
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.redirect(new URL(next, url.origin))
}
