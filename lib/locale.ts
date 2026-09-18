export const LOCALES = ["fr", "ar", "en"] as const
export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = "fr"

export const LOCALE_META: Record<
  Locale,
  { label: string; flag: string; dir: "ltr" | "rtl"; lang: string }
> = {
  fr: { label: "Français", flag: "🇫🇷", dir: "ltr", lang: "fr" },
  ar: { label: "العربية", flag: "🇹🇳", dir: "rtl", lang: "ar" },
  en: { label: "English", flag: "🇬🇧", dir: "ltr", lang: "en" },
}
