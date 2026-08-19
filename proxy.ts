import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { updateSession } from "@/lib/supabase/middleware"
import { createServerSupabase } from "@/lib/supabase/server"
import { isAllowedIntoAdmin } from "@/lib/auth/admin-gate"

/** Headers de sécurité appliqués sur toutes les réponses HTML et API */
const SECURITY_HEADERS: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  // HSTS : 1 an, inclure sous-domaines — activer seulement en prod via env
  ...(process.env.NODE_ENV === "production"
    ? { "Strict-Transport-Security": "max-age=31536000; includeSubDomains" }
    : {}),
}

const ADMIN_ROUTES = /^\/admin(\/|$)/

export async function proxy(request: NextRequest) {
  const response = await updateSession(request)
  
  // Vérification RBAC pour routes admin
  if (ADMIN_ROUTES.test(request.nextUrl.pathname)) {
    const supabase = await createServerSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      const loginUrl = new URL("/login", request.url)
      loginUrl.searchParams.set("next", request.nextUrl.pathname)
      return NextResponse.redirect(loginUrl)
    }
    
    // Rôle ET type d'agence : voir lib/auth/admin-gate.ts pour le pourquoi
    // (manager/agent_resa/etc. sont des rôles partagés entre staff Easy2Book
    // et personnel d'agence partenaire — le rôle seul ne suffit pas).
    const { data: profile } = await supabase
      .from("users")
      .select("role, agencies(agency_type)")
      .eq("id", user.id)
      .single()

    const agencyRel = (
      profile?.agencies as { agency_type?: string } | { agency_type?: string }[] | null
    )
    const resolvedAgencyType = Array.isArray(agencyRel)
      ? agencyRel[0]?.agency_type
      : agencyRel?.agency_type

    if (!isAllowedIntoAdmin(profile?.role, resolvedAgencyType)) {
      return NextResponse.redirect(new URL("/unauthorized", request.url))
    }
  }
  
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value)
  }
  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico / icons / images
     * - manifest.json (PWA manifest)
     * - public assets (any path with a file extension)
     */
    "/((?!_next/static|_next/image|favicon.ico|icon\\.svg|icon-.*\\.png|apple-icon\\.png|manifest\\.json|placeholder.*\\.(?:png|jpg|svg)).*)",
  ],
}
