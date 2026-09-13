import { getRequestConfig } from "next-intl/server"
import { hasLocale } from "next-intl"

import { routing } from "./routing"

/**
 * Charge le dictionnaire `messages/{locale}.json` correspondant au segment
 * `[locale]` résolu par le middleware — voir `app/(public)/[locale]/layout.tsx`
 * (appelle `setRequestLocale`) et `i18n/routing.ts`.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  }
})
