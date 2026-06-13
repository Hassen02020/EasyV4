export const LOCALES = ["fr", "ar", "en"] as const
export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = "fr"
export const LOCALE_COOKIE = "e2b_locale"

export const LOCALE_META: Record<
  Locale,
  { label: string; flag: string; dir: "ltr" | "rtl"; lang: string }
> = {
  fr: { label: "Français", flag: "🇫🇷", dir: "ltr", lang: "fr" },
  ar: { label: "العربية", flag: "🇹🇳", dir: "rtl", lang: "ar" },
  en: { label: "English", flag: "🇬🇧", dir: "ltr", lang: "en" },
}

export function parseLocale(value: string | undefined | null): Locale {
  if (value && (LOCALES as readonly string[]).includes(value)) {
    return value as Locale
  }
  return DEFAULT_LOCALE
}

export function getLocaleFromCookie(cookieValue: string | undefined): Locale {
  return parseLocale(cookieValue)
}
