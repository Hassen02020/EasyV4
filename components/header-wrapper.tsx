import { getLocale } from "next-intl/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { getRequestTenantInfo } from "@/lib/tenant/current-tenant"
import { Header } from "@/components/header"
import type { Locale } from "@/lib/locale"

export async function HeaderWrapper() {
  const locale = (await getLocale()) as Locale
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const tenant = await getRequestTenantInfo()
  return (
    <Header
      currentLocale={locale}
      isLoggedIn={!!user}
      brandName={tenant?.brandName ?? null}
      logoUrl={tenant?.logoUrl ?? null}
    />
  )
}
