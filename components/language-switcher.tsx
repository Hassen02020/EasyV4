"use client"

import { usePathname, useSearchParams } from "next/navigation"
import { Globe, ChevronDown, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
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

  const other = LOCALES.filter((l) => l !== currentLocale)[0]

  if (variant === "mobile") {
    return (
      <button
        type="button"
        onClick={() => handleSelect(other)}
        className="text-foreground hover:bg-muted flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors disabled:opacity-50"
      >
        <Globe className="size-5 text-[#1e3a5f]" />
        <span>
          {currentLocale.toUpperCase()} / {other.toUpperCase()}
        </span>
      </button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-sm font-medium"
          aria-label="Changer de langue"
        >
          <Globe className="size-4" aria-hidden="true" />
          {currentLocale.toUpperCase()} / {other.toUpperCase()}
          <ChevronDown className="size-3 opacity-50" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[140px]">
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
                {meta.label}
              </span>
              {locale === currentLocale && (
                <Check className="size-3.5 text-[#1e3a5f]" aria-hidden="true" />
              )}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
