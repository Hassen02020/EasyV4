import { cookies } from "next/headers"
import { parseLocale, LOCALE_COOKIE } from "@/lib/locale"
import { createServerSupabase } from "@/lib/supabase/server"
import { Header } from "@/components/header"

export async function HeaderWrapper() {
  const jar = await cookies()
  const locale = parseLocale(jar.get(LOCALE_COOKIE)?.value)
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return <Header currentLocale={locale} isLoggedIn={!!user} />
}
