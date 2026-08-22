import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { updateSession } from "@/lib/supabase/middleware"
import { createServerSupabase, createServiceRoleSupabase } from "@/lib/supabase/server"
import { isAllowedIntoAdmin } from "@/lib/auth/admin-gate"
import { normalizeHost } from "@/lib/tenant/host"
import { isTenantExemptRoute } from "@/lib/tenant/route-scope"
import {
  TENANT_AGENCY_ID_HEADER,
  TENANT_DOMAIN_HEADER,
  TENANT_BRAND_NAME_HEADER,
} from "@/lib/tenant/current-tenant"

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

/**
 * Résout le tenant White Label pour ce host (Phase 13.2, câblage runtime).
 *
 * Utilise le client Supabase "service role" (bypass RLS), pas
 * `createServerSupabase()` (respecte RLS) : `agencies_select` exige
 * `id = current_agency_id() OR is_super_admin()` — un visiteur anonyme
 * du storefront n'a NI session NI agence courante, donc RLS bloquerait
 * systématiquement cette lecture avec le client normal. Le service role
 * est justifié ici (même style que la garde RBAC juste en dessous, qui
 * lit `users`/`agencies` sans RLS via une fonction SECURITY DEFINER) : on
 * ne sélectionne QUE des colonnes déjà publiques par nature pour un
 * storefront (id/brand_name/domain/status) — jamais `deposit_balance`,
 * `matricule_fiscale` ou toute autre colonne agence sensible.
 */
async function resolveTenantForHost(
  host: string | null,
): Promise<{ agencyId: string; domain: string; brandName: string | null } | null> {
  if (!host) return null
  const normalized = normalizeHost(host)
  if (!normalized) return null

  try {
    const supabase = createServiceRoleSupabase()
    const { data } = await supabase
      .from("agencies")
      .select("id, brand_name, domain, status")
      .eq("domain", normalized)
      .eq("status", "active")
      .maybeSingle()

    if (!data) return null
    return { agencyId: data.id, domain: data.domain as string, brandName: data.brand_name }
  } catch {
    // Panne BDD/config manquante : on ne bloque jamais le storefront par
    // défaut pour une erreur de résolution tenant — retombe simplement sur
    // le domaine par défaut (comportement identique à avant ce câblage).
    return null
  }
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // --- White Label : résoudre le tenant AVANT updateSession(), pour que
  // le header posé ici soit visible dans la réponse qu'updateSession()
  // construit elle-même (elle réutilise le même objet `request`). Le
  // header entrant est TOUJOURS explicitement effacé d'abord : un client
  // ne doit jamais pouvoir usurper son propre tenant en envoyant
  // `x-tenant-agency-id` directement.
  request.headers.delete(TENANT_AGENCY_ID_HEADER)
  request.headers.delete(TENANT_DOMAIN_HEADER)
  request.headers.delete(TENANT_BRAND_NAME_HEADER)

  if (!isTenantExemptRoute(pathname)) {
    const tenant = await resolveTenantForHost(request.headers.get("host"))
    if (tenant) {
      request.headers.set(TENANT_AGENCY_ID_HEADER, tenant.agencyId)
      request.headers.set(TENANT_DOMAIN_HEADER, tenant.domain)
      if (tenant.brandName) request.headers.set(TENANT_BRAND_NAME_HEADER, tenant.brandName)
    }
  }

  const response = await updateSession(request)

  // Vérification RBAC pour routes admin
  if (ADMIN_ROUTES.test(pathname)) {
    const supabase = await createServerSupabase()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      const loginUrl = new URL("/login", request.url)
      loginUrl.searchParams.set("next", pathname)
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
