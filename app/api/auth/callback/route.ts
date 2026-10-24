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
import { safeInternalRedirect } from "@/lib/api/safe-redirect"
import { guestTenantContext } from "@/lib/hotel-suppliers/tenant/live-resolution"
import { withTenantContext } from "@/lib/db/tenant-context"
import { linkGuestCustomerToAuth } from "@/lib/booking/customer-identity"
import { logger } from "@/lib/logger"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const next = safeInternalRedirect(
    url.searchParams.get("next"),
    url.origin,
    "/admin",
  )

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

  // Best-effort : lier les bookings guest au compte nouvellement authentifié.
  // N'est jamais bloquant — un échec ne retarde ni n'empêche la redirection.
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user?.email) {
      const tenant = await guestTenantContext()
      if (tenant?.agencyId) {
        const result = await withTenantContext(tenant, (tx) =>
          linkGuestCustomerToAuth(tx, {
            agencyId: tenant.agencyId!,
            email: user.email!,
            userId: user.id,
          }),
        )
        if (result.skipped === "collision") {
          logger.warn("[auth/callback] guest linking skipped — collision", {
            userId: user.id,
            agencyId: tenant.agencyId,
          })
        }
      }
    }
  } catch (err) {
    logger.warn("[auth/callback] guest linking failed (best-effort)", {
      error: err,
    })
  }

  return NextResponse.redirect(new URL(next, url.origin))
}
