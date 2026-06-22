/**
 * Middleware Supabase — rafraîchit la session sur chaque requête et redirige
 * les utilisateurs non authentifiés qui tentent d'accéder à `/admin/*`.
 *
 * Appelé depuis `middleware.ts` (racine projet).
 */

import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"

const ADMIN_PREFIX = "/admin"
const PRO_PREFIX = "/pro"
const MUTUELLE_PREFIX = "/mutuelle"
// URLs de connexion canoniques (alignées sur la production easy2book.tn).
const ADMIN_LOGIN_PATH = "/admin/login"
const AGENCY_LOGIN_PATH = "/agency/login"
const MUTUELLE_LOGIN_PATH = "/mutuelle/login"
const AUTH_CALLBACK_PATH = "/api/auth/callback"
// Anciennes URLs conservées comme alias publics (rétro-compatibilité).
const LEGACY_PRO_LOGIN_PATH = "/pro/login"

/**
 * Routes protégées (auth requise) :
 *  - `/admin/*` → back-office OTA (super_admin / manager / agents)
 *  - `/pro/*` (sauf `/pro/login`) → portail B2B partenaire
 *  - `/mutuelle/*` (sauf `/mutuelle/login`) → espace mutuelle
 */
function isProtectedPath(pathname: string): boolean {
  // La page de connexion admin doit rester publique malgré le préfixe /admin.
  if (pathname === ADMIN_LOGIN_PATH) return false
  if (pathname === ADMIN_PREFIX || pathname.startsWith(`${ADMIN_PREFIX}/`)) {
    return true
  }
  if (pathname === LEGACY_PRO_LOGIN_PATH) return false
  if (pathname === PRO_PREFIX || pathname.startsWith(`${PRO_PREFIX}/`)) {
    return true
  }
  if (pathname === MUTUELLE_LOGIN_PATH) return false
  if (
    pathname === MUTUELLE_PREFIX ||
    pathname.startsWith(`${MUTUELLE_PREFIX}/`)
  ) {
    return true
  }
  return false
}

function loginPathFor(pathname: string): string {
  if (pathname === PRO_PREFIX || pathname.startsWith(`${PRO_PREFIX}/`)) {
    return AGENCY_LOGIN_PATH
  }
  if (
    pathname === MUTUELLE_PREFIX ||
    pathname.startsWith(`${MUTUELLE_PREFIX}/`)
  ) {
    return MUTUELLE_LOGIN_PATH
  }
  return ADMIN_LOGIN_PATH
}

export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Fail-closed : si Supabase n'est pas configuré, bloquer les routes protégées.
  // En dev sans .env, les routes publiques restent accessibles.
  if (!url || !anonKey) {
    const pathname = request.nextUrl.pathname
    if (isProtectedPath(pathname)) {
      const loginUrl = request.nextUrl.clone()
      loginUrl.pathname = loginPathFor(pathname)
      loginUrl.searchParams.set("next", pathname + request.nextUrl.search)
      return NextResponse.redirect(loginUrl)
    }
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
    loginUrl.pathname = loginPathFor(pathname)
    loginUrl.searchParams.set("next", pathname + request.nextUrl.search)
    return NextResponse.redirect(loginUrl)
  }

  return response
}
