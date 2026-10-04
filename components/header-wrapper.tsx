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
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const tenant = await getRequestTenantInfo()
  const site = await getPublicSiteConfig()
  const contact = await getSiteContactInfo(tenant?.agencyId ?? null)
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
