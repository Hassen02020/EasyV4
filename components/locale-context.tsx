"use client"

import { createContext, useContext, useState, useEffect } from "react"
import type { Locale } from "@/lib/locale"
import { getT, type TranslationKey } from "@/lib/i18n"
import { LOCALE_COOKIE } from "@/lib/locale"

const LocaleContext = createContext<Locale>("fr")

export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale
  children: React.ReactNode
}) {
  const [locale, setLocale] = useState<Locale>(initialLocale)

  useEffect(() => {
    // Écouter les changements de cookie de locale
    const checkLocale = () => {
      const match = document.cookie.match(new RegExp(`(^| )${LOCALE_COOKIE}=([^;]+)`))
      const newLocale = match ? match[2] : "fr"
      if (newLocale !== locale) {
        setLocale(newLocale as Locale)
      }
    }

    // Vérifier périodiquement
    const interval = setInterval(checkLocale, 500)
    return () => clearInterval(interval)
  }, [locale])

  return (
    <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
  )
}

export function useLocale(): Locale {
  return useContext(LocaleContext)
}

export function useT() {
  const locale = useLocale()
  return getT(locale)
}
