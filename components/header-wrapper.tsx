import { getLocale } from "next-intl/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { getRequestTenantInfo } from "@/lib/tenant/current-tenant"
import { getSiteContactInfo } from "@/lib/tenant/site-config"
import { Header } from "@/components/header"
import { getPublicSiteConfig } from "@/lib/public/site-content"
import type { Locale } from "@/lib/locale"

export async function HeaderWrapper() {
  const locale = (await getLocale()) as Locale
  const supabase = await createServerSupabase()
  // Auth server may be unreachable in dev (GoTrue not running). Cap at 3 s and
  // degrade to logged-out state rather than blocking the whole page render.
  const user = await Promise.race([
    supabase.auth
      .getUser()
      .then((r) => r.data.user)
      .catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
  ])
  // Tenant is resolved from request headers — no network call.
  const tenant = await getRequestTenantInfo().catch(() => null)
  // DB calls may stall when the database is unreachable (postgres-js pool
  // backoff after all connections fail). Run both concurrently and cap each
  // at 1 s so the header never blocks public page render regardless of DB
  // availability.
  const [site, contact] = await Promise.all([
    Promise.race([
      getPublicSiteConfig().catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1000)),
    ]),
    Promise.race([
      getSiteContactInfo(tenant?.agencyId ?? null).catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1000)),
    ]),
  ])
  return (
    <Header
      currentLocale={locale}
      isLoggedIn={!!user}
      brandName={tenant?.brandName ?? null}
      logoUrl={tenant?.logoUrl ?? site?.logoUrl ?? null}
      contactPhone={contact?.contactPhone ?? site?.contactPhone ?? null}
    />
  )
}
