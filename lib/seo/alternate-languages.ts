import { getPathname } from "@/i18n/navigation"
import { routing } from "@/i18n/routing"

/**
 * Construit la map `alternates.languages` (fr/en/ar + x-default) d'un
 * `Metadata` Next.js pour un chemin interne donné — via `getPathname()`
 * (next-intl) plutôt qu'une concaténation manuelle du préfixe de locale,
 * pour rester correct si `i18n/routing.ts` change un jour (voir plan i18n,
 * lot final, §"SEO"). `href` est le chemin SANS préfixe de locale, avec ses
 * segments dynamiques déjà résolus (ex. `/omra/${id}`, pas `/omra/[id]`) —
 * `x-default` pointe vers la variante `defaultLocale` (français).
 */
export function buildLanguageAlternates(href: string): Record<string, string> {
  const languages = Object.fromEntries(
    routing.locales.map((locale) => [locale, getPathname({ locale, href })]),
  )
  return { ...languages, "x-default": languages[routing.defaultLocale] }
}
