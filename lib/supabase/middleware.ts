/**
 * Middleware Supabase — rafraîchit la session sur chaque requête et redirige
 * les utilisateurs non authentifiés qui tentent d'accéder à `/admin/*`.
 *
 * Appelé depuis `middleware.ts` (racine projet).
 */

import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"

const ADMIN_PREFIX = "/admin"
const LOGIN_PATH = "/login"
const AUTH_CALLBACK_PATH = "/api/auth/callback"

/**
 * Routes publiques (pas de protection auth).
 * Note : `/admin` est protégée, mais `/login` doit rester accessible.
 */
function isProtectedPath(pathname: string): boolean {
  return pathname === ADMIN_PREFIX || pathname.startsWith(`${ADMIN_PREFIX}/`)
}

export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Si Supabase pas configuré (dev sans .env) : on laisse passer pour ne pas
  // casser le développement local. La protection /admin n'aura pas d'effet
  // tant que les env vars ne sont pas définies.
  if (!url || !anonKey) {
    return NextResponse.next({ request })
  }

  let response = NextResponse.next({ request })

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value)
        }
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
      },
    },
  })

  // IMPORTANT : on doit appeler `getUser()` immédiatement après `createServerClient`
  // pour rafraîchir la session avant de servir la requête.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  if (!user && isProtectedPath(pathname) && pathname !== AUTH_CALLBACK_PATH) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = LOGIN_PATH
    loginUrl.searchParams.set("next", pathname + request.nextUrl.search)
    return NextResponse.redirect(loginUrl)
  }

  return response
}
