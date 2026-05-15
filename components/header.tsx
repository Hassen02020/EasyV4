"use client"

import { useState } from "react"
import Link from "next/link"
import {
  Globe,
  HelpCircle,
  CalendarCheck,
  User,
  Menu,
  X,
  ChevronDown,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Easy2BookLogo } from "@/components/easy2book-logo"

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [language, setLanguage] = useState<"FR" | "AR">("FR")
  const [currency, setCurrency] = useState<"TND" | "EUR" | "USD">("TND")

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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-sm font-medium"
                >
                  <Globe className="size-4" />
                  {language} / {language === "FR" ? "AR" : "FR"}
                  <ChevronDown className="size-3 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setLanguage("FR")}>
                  Français
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setLanguage("AR")}>
                  العربية
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-sm font-medium"
                >
                  <span className="font-bold text-[#1e3a5f]">¤</span>
                  {currency}
                  <ChevronDown className="size-3 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setCurrency("TND")}>
                  TND — Dinar tunisien
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setCurrency("EUR")}>
                  EUR — Euro
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setCurrency("USD")}>
                  USD — US Dollar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-sm font-medium"
              asChild
            >
              <Link href="#help">
                <HelpCircle className="size-4" />
                Help
              </Link>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-sm font-medium"
              asChild
            >
              <Link href="/bookings">
                <CalendarCheck className="size-4" />
                My Bookings
              </Link>
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="ml-2 gap-1.5 border-[#1e3a5f] text-[#1e3a5f] hover:bg-[#1e3a5f] hover:text-white"
              asChild
            >
              <Link href="/login">
                <User className="size-4" />
                Connexion
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
            <button
              type="button"
              onClick={() => setLanguage(language === "FR" ? "AR" : "FR")}
              className="text-foreground hover:bg-muted flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors"
            >
              <Globe className="size-5 text-[#1e3a5f]" />
              <span>
                {language} / {language === "FR" ? "AR" : "FR"}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                const next =
                  currency === "TND"
                    ? "EUR"
                    : currency === "EUR"
                      ? "USD"
                      : "TND"
                setCurrency(next)
              }}
              className="text-foreground hover:bg-muted flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors"
            >
              <span className="flex size-5 items-center justify-center font-bold text-[#1e3a5f]">
                ¤
              </span>
              <span>{currency}</span>
            </button>
            <Link
              href="#help"
              className="text-foreground hover:bg-muted flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors"
              onClick={() => setMobileMenuOpen(false)}
            >
              <HelpCircle className="size-5 text-[#1e3a5f]" />
              <span>Help</span>
            </Link>
            <Link
              href="/bookings"
              className="text-foreground hover:bg-muted flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors"
              onClick={() => setMobileMenuOpen(false)}
            >
              <CalendarCheck className="size-5 text-[#1e3a5f]" />
              <span>My Bookings</span>
            </Link>
            <div className="border-border border-t pt-4">
              <Button
                className="w-full gap-2 bg-[#1e3a5f] hover:bg-[#152d4a]"
                asChild
              >
                <Link href="/login">
                  <User className="size-4" />
                  Connexion
                </Link>
              </Button>
            </div>
          </nav>
        </div>
      )}
    </header>
  )
}
