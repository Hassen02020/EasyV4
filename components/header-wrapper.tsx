import { cookies } from "next/headers"
import { parseLocale, LOCALE_COOKIE } from "@/lib/locale"
import { Header } from "@/components/header"

export async function HeaderWrapper() {
  const jar = await cookies()
  const locale = parseLocale(jar.get(LOCALE_COOKIE)?.value)
  return <Header currentLocale={locale} />
}
