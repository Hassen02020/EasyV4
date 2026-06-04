"use client"

import { useState } from "react"
import Link from "next/link"
import {
  HelpCircle,
  CalendarCheck,
  User,
  Menu,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Easy2BookLogo } from "@/components/easy2book-logo"
import { LanguageSwitcher } from "@/components/language-switcher"
import { CurrencySwitcher } from "@/components/currency-switcher"
import type { Locale } from "@/lib/locale"
import { useT } from "@/components/locale-context"

interface HeaderProps {
  currentLocale?: Locale
}

export function Header({ currentLocale = "fr" }: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const t = useT()

  return (
    <header className="bg-card border-border sticky top-0 z-50 border-b shadow-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center gap-2"
            aria-label="Easy2Book — retour à l'accueil"
          >
            <Easy2BookLogo className="size-10" priority />
            <span className="text-xl font-bold">
              <span className="text-[#1e3a5f]">Easy</span>
              <span className="text-[#e5b94e]">2</span>
              <span className="text-[#1e3a5f]">Book</span>
            </span>
          </Link>

          {/* Desktop Right Actions */}
          <div className="hidden items-center gap-1 lg:flex">
            <LanguageSwitcher currentLocale={currentLocale} variant="desktop" />

            <CurrencySwitcher variant="desktop" />

            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-sm font-medium"
              asChild
            >
              <Link href="#help">
                <HelpCircle className="size-4" />
                {t("help")}
              </Link>
            </Button>

            <Link
              href="/bookings"
              className="inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <CalendarCheck className="size-4" />
              {t("myBookings")}
            </Link>

            <Button
              variant="outline"
              size="sm"
              className="ml-2 gap-1.5 border-[#1e3a5f] text-[#1e3a5f] hover:bg-[#1e3a5f] hover:text-white"
              asChild
            >
              <Link href="/login">
                <User className="size-4" />
                {t("connexion")}
              </Link>
            </Button>
          </div>

          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? (
              <X className="size-6" />
            ) : (
              <Menu className="size-6" />
            )}
          </Button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="border-border bg-card border-t lg:hidden">
          <nav className="mx-auto max-w-7xl space-y-1 px-4 py-4">
            <LanguageSwitcher currentLocale={currentLocale} variant="mobile" />
            <CurrencySwitcher variant="mobile" />
            <Link
              href="#help"
              className="text-foreground hover:bg-muted flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors"
              onClick={() => setMobileMenuOpen(false)}
            >
              <HelpCircle className="size-5 text-[#1e3a5f]" />
              <span>{t("help")}</span>
            </Link>
            <Link
              href="/bookings"
              className="text-foreground hover:bg-muted flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors"
              onClick={() => setMobileMenuOpen(false)}
            >
              <CalendarCheck className="size-5 text-[#1e3a5f]" />
              <span>{t("myBookings")}</span>
            </Link>
            <div className="border-border border-t pt-4">
              <Button
                className="w-full gap-2 bg-[#1e3a5f] hover:bg-[#152d4a]"
                asChild
              >
                <Link href="/login">
                  <User className="size-4" />
                  {t("connexion")}
                </Link>
              </Button>
            </div>
          </nav>
        </div>
      )}
    </header>
  )
}
