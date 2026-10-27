"use client"

import { useEffect, useState } from "react"
import { Link, usePathname } from "@/i18n/navigation"
import { HelpCircle, CalendarCheck, User, Menu, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Easy2BookLogo } from "@/components/easy2book-logo"
import { LanguageSwitcher } from "@/components/language-switcher"
import { CurrencySwitcher } from "@/components/currency-switcher"
import type { Locale } from "@/lib/locale"
import { useTranslations } from "next-intl"
import { createBrowserSupabase } from "@/lib/supabase/client"
import { CartBadgeLink } from "@/components/cart/cart-badge-link"
import {
  getVisiblePublicModules,
  type PublicModuleVisual,
} from "@/lib/public/module-nav"
import { cn } from "@/lib/utils"

interface HeaderProps {
  currentLocale?: Locale
  /** Résolu côté serveur par HeaderWrapper quand disponible ; sinon résolu ici côté client. */
  isLoggedIn?: boolean
  /** Nom d'agence White Label résolu par proxy.ts (via HeaderWrapper) ; absent = domaine par défaut Easy2Book. */
  brandName?: string | null
  /** Logo d'agence White Label ; absent = logo Easy2Book par défaut. */
  logoUrl?: string | null
  /** Téléphone de contact résolu depuis la BDD par HeaderWrapper ; absent = lien désactivé. */
  contactPhone?: string | null
  /** Activation des modules (public_module_visuals) ; vide = tous les modules. */
  modules?: Pick<PublicModuleVisual, "moduleSlug" | "enabled">[]
}

export function Header({
  currentLocale = "fr",
  isLoggedIn,
  brandName,
  logoUrl,
  contactPhone,
  modules = [],
}: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [loggedIn, setLoggedIn] = useState(!!isLoggedIn)
  const t = useTranslations("Common")
  const pathname = usePathname()
  const visibleModules = getVisiblePublicModules(modules)
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`)

  useEffect(() => {
    if (isLoggedIn !== undefined) return
    let cancelled = false
    const supabase = createBrowserSupabase()
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!cancelled) setLoggedIn(!!user)
    })()
    return () => {
      cancelled = true
    }
  }, [isLoggedIn])

  return (
    <header className="bg-card border-border sticky top-0 z-50 border-b shadow-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center gap-2"
            aria-label={t("backToHome", { brand: brandName ?? "Easy2Book" })}
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- logo d'agence hébergé sur un CDN arbitraire (agencies.logoUrl), non listé dans next.config remotePatterns
              <img
                src={logoUrl}
                alt={brandName ?? "Logo agence"}
                className="bg-muted size-10 rounded object-contain"
              />
            ) : (
              <Easy2BookLogo
                withWordmark={false}
                className="bg-muted size-10"
                priority
              />
            )}
            {brandName ? (
              <span className="text-sidebar text-xl font-bold">
                {brandName}
              </span>
            ) : (
              <span className="text-xl font-bold">
                <span className="text-sidebar">Easy</span>
                <span className="text-accent">2</span>
                <span className="text-sidebar">Book</span>
              </span>
            )}
          </Link>

          {/* Desktop Right Actions */}
          <div className="hidden items-center gap-1 lg:flex">
            <LanguageSwitcher currentLocale={currentLocale} variant="desktop" />

            <CurrencySwitcher variant="desktop" />

            {contactPhone && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-sm font-medium"
                asChild
              >
                <Link
                  href={`tel:${contactPhone.startsWith("+") ? "" : "+"}${contactPhone}`}
                >
                  <HelpCircle className="size-4" />
                  {t("help")}
                </Link>
              </Button>
            )}

            <Link
              href="/bookings"
              className="hover:bg-accent hover:text-accent-foreground inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors"
            >
              <CalendarCheck className="size-4" />
              {t("myBookings")}
            </Link>

            <CartBadgeLink variant="desktop" />

            <Button
              variant="outline"
              size="sm"
              className="border-sidebar text-sidebar hover:bg-sidebar ml-2 gap-1.5 hover:text-white"
              asChild
            >
              <Link href="/compte">
                <User className="size-4" />
                {loggedIn ? t("monCompte") : t("connexion")}
              </Link>
            </Button>
          </div>

          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={t("toggleMenu")}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-menu"
          >
            {mobileMenuOpen ? (
              <X className="size-6" />
            ) : (
              <Menu className="size-6" />
            )}
          </Button>
        </div>
      </div>

      {/* Desktop module navigation */}
      <nav
        aria-label={t("nosServices")}
        className="border-border hidden border-t lg:block"
      >
        <ul className="no-scrollbar mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 sm:px-6 lg:px-8">
          {visibleModules.map((module) => {
            const Icon = module.icon
            const active = isActive(module.href)
            return (
              <li key={module.id} className="shrink-0">
                <Link
                  href={module.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "focus-visible:ring-ring/50 flex items-center gap-1.5 rounded-t-sm border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-[3px]",
                    active
                      ? "border-accent text-sidebar"
                      : "text-muted-foreground hover:text-foreground border-transparent",
                  )}
                >
                  <Icon
                    className="text-accent size-4"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  {t(module.labelKey)}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div
          id="mobile-menu"
          className="border-border bg-card border-t lg:hidden"
        >
          <nav className="mx-auto max-w-7xl space-y-1 px-4 py-4">
            <p className="text-muted-foreground px-4 pt-1 pb-1 text-xs font-semibold tracking-wide uppercase">
              {t("nosServices")}
            </p>
            <ul className="grid grid-cols-2 gap-1">
              {visibleModules.map((module) => {
                const Icon = module.icon
                const active = isActive(module.href)
                return (
                  <li key={module.id}>
                    <Link
                      href={module.href}
                      aria-current={active ? "page" : undefined}
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        "focus-visible:ring-ring/50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium outline-none transition-colors focus-visible:ring-[3px]",
                        active
                          ? "bg-muted text-sidebar"
                          : "text-foreground hover:bg-muted",
                      )}
                    >
                      <Icon
                        className="text-accent size-5 shrink-0"
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                      <span>{t(module.labelKey)}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
            <div className="border-border border-t pt-2" />
            <LanguageSwitcher currentLocale={currentLocale} variant="mobile" />
            <CurrencySwitcher variant="mobile" />
            {contactPhone && (
              <Link
                href={`tel:${contactPhone.startsWith("+") ? "" : "+"}${contactPhone}`}
                className="text-foreground hover:bg-muted flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                <HelpCircle className="text-sidebar size-5" />
                <span>{t("help")}</span>
              </Link>
            )}
            <Link
              href="/bookings"
              className="text-foreground hover:bg-muted flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors"
              onClick={() => setMobileMenuOpen(false)}
            >
              <CalendarCheck className="text-sidebar size-5" />
              <span>{t("myBookings")}</span>
            </Link>
            <div onClick={() => setMobileMenuOpen(false)}>
              <CartBadgeLink variant="mobile" />
            </div>
            <div className="border-border border-t pt-4">
              <Button
                className="bg-sidebar hover:bg-sidebar/90 w-full gap-2"
                asChild
              >
                <Link href="/compte" onClick={() => setMobileMenuOpen(false)}>
                  <User className="size-4" />
                  {loggedIn ? t("monCompte") : t("connexion")}
                </Link>
              </Button>
            </div>
          </nav>
        </div>
      )}
    </header>
  )
}
