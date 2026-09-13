/**
 * Locale-aware helpers for date-fns formatting and native
 * `toLocaleDateString`/`toLocaleString` calls — chrome-only concern (date
 * *display*, never the underlying computed date/business logic), used by
 * the storefront public modules (Lot 3 i18n) so that date labels genuinely
 * differ across /fr /en /ar instead of always rendering in French.
 */
import { fr, enUS, arTN } from "date-fns/locale"
import type { Locale as DateFnsLocale } from "date-fns"

const DATE_FNS_LOCALES: Record<string, DateFnsLocale> = { fr, en: enUS, ar: arTN }

/** date-fns `locale` option matching a next-intl locale (`fr`/`en`/`ar`). */
export function getDateFnsLocale(locale: string): DateFnsLocale {
  return DATE_FNS_LOCALES[locale] ?? fr
}

/** BCP-47 tag for native `Date#toLocaleDateString`/`toLocaleString` calls. */
export function getIntlLocale(locale: string): string {
  return locale === "en" ? "en-US" : locale === "ar" ? "ar-TN" : "fr-FR"
}
