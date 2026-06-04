"use client"

import { usePathname, useSearchParams } from "next/navigation"
import { Globe, ChevronDown, Check } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { LOCALES, LOCALE_META, type Locale } from "@/lib/locale"

interface LanguageSwitcherProps {
  currentLocale: Locale
  variant?: "desktop" | "mobile"
}

export function LanguageSwitcher({
  currentLocale,
  variant = "desktop",
}: LanguageSwitcherProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function handleSelect(locale: Locale) {
    if (locale === currentLocale) return
    const params = searchParams.toString()
    const redirectTo = params ? `${pathname}?${params}` : pathname
    window.location.href = `/api/set-locale?locale=${locale}&redirectTo=${encodeURIComponent(redirectTo)}`
  }

  const menu = (
    <DropdownMenuContent align="end" className="min-w-[130px]">
      {LOCALES.map((locale) => {
        const meta = LOCALE_META[locale]
        return (
          <DropdownMenuItem
            key={locale}
            onClick={() => handleSelect(locale)}
            className="flex items-center justify-between gap-2"
          >
            <span className="flex items-center gap-2">
              <span aria-hidden="true">{meta.flag}</span>
              <span className="font-medium">{meta.label}</span>
            </span>
            {locale === currentLocale && (
              <Check className="size-3.5 text-[#1e3a5f]" aria-hidden="true" />
            )}
          </DropdownMenuItem>
        )
      })}
    </DropdownMenuContent>
  )

  const triggerClass =
    variant === "mobile"
      ? "text-foreground hover:bg-muted flex w-full items-center gap-3 rounded-lg px-4 py-3 transition-colors"
      : "flex items-center gap-1 rounded-md px-2 py-1.5 hover:bg-accent transition-colors"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={triggerClass}
          aria-label="Switch language"
        >
          {variant === "mobile" && <Globe className="size-5 text-[#1e3a5f]" />}
          <span className="text-base font-bold tracking-wider text-[#1e3a5f] uppercase">
            {currentLocale}
          </span>
          <ChevronDown className="size-3.5 text-[#1e3a5f] opacity-60" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      {menu}
    </DropdownMenu>
  )
}
