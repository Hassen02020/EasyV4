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

  const current = LOCALE_META[currentLocale]

  const trigger = (
    <Button
      variant="ghost"
      size="sm"
      className="gap-1.5 text-sm font-medium"
      aria-label="Switch language"
    >
      <Globe className="size-4" aria-hidden="true" />
      <span aria-hidden="true">{current.flag}</span>
      {current.label}
      <ChevronDown className="size-3 opacity-50" aria-hidden="true" />
    </Button>
  )

  const menu = (
    <DropdownMenuContent align="end" className="min-w-[150px]">
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
  )

  if (variant === "mobile") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="text-foreground hover:bg-muted flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors"
          >
            <Globe className="size-5 text-[#1e3a5f]" />
            <span aria-hidden="true">{current.flag}</span>
            <span>{current.label}</span>
            <ChevronDown className="size-4 ml-auto opacity-50" />
          </button>
        </DropdownMenuTrigger>
        {menu}
      </DropdownMenu>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      {menu}
    </DropdownMenu>
  )
}
