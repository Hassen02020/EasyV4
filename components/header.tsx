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
import { TunisiaGoLogo } from "@/components/tunisia-go-logo"

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [language, setLanguage] = useState<"FR" | "AR">("FR")
  const [currency, setCurrency] = useState<"TND" | "EUR" | "USD">("TND")

  return (
    <header className="bg-card border-b border-border sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <TunisiaGoLogo className="size-9" />
            <span className="text-xl font-bold">
              <span className="text-[#1e3a5f]">Tunisia</span>
              <span className="text-[#e5b94e]">Go</span>
            </span>
          </Link>

          {/* Desktop Right Actions */}
          <div className="hidden lg:flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1.5 text-sm font-medium">
                  <Globe className="size-4" />
                  {language} / {language === "FR" ? "AR" : "FR"}
                  <ChevronDown className="size-3 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setLanguage("FR")}>Français</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setLanguage("AR")}>العربية</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1.5 text-sm font-medium">
                  <span className="font-bold text-[#1e3a5f]">¤</span>
                  {currency}
                  <ChevronDown className="size-3 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setCurrency("TND")}>TND — Dinar tunisien</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setCurrency("EUR")}>EUR — Euro</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setCurrency("USD")}>USD — US Dollar</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button variant="ghost" size="sm" className="gap-1.5 text-sm font-medium" asChild>
              <Link href="#help">
                <HelpCircle className="size-4" />
                Help
              </Link>
            </Button>

            <Button variant="ghost" size="sm" className="gap-1.5 text-sm font-medium" asChild>
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
            {mobileMenuOpen ? <X className="size-6" /> : <Menu className="size-6" />}
          </Button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-border bg-card">
          <nav className="max-w-7xl mx-auto px-4 py-4 space-y-1">
            <button
              type="button"
              onClick={() => setLanguage(language === "FR" ? "AR" : "FR")}
              className="flex items-center gap-3 w-full px-4 py-3 text-sm font-medium text-foreground hover:bg-muted rounded-lg transition-colors"
            >
              <Globe className="size-5 text-[#1e3a5f]" />
              <span>{language} / {language === "FR" ? "AR" : "FR"}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                const next = currency === "TND" ? "EUR" : currency === "EUR" ? "USD" : "TND"
                setCurrency(next)
              }}
              className="flex items-center gap-3 w-full px-4 py-3 text-sm font-medium text-foreground hover:bg-muted rounded-lg transition-colors"
            >
              <span className="size-5 flex items-center justify-center font-bold text-[#1e3a5f]">¤</span>
              <span>{currency}</span>
            </button>
            <Link
              href="#help"
              className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-foreground hover:bg-muted rounded-lg transition-colors"
              onClick={() => setMobileMenuOpen(false)}
            >
              <HelpCircle className="size-5 text-[#1e3a5f]" />
              <span>Help</span>
            </Link>
            <Link
              href="/bookings"
              className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-foreground hover:bg-muted rounded-lg transition-colors"
              onClick={() => setMobileMenuOpen(false)}
            >
              <CalendarCheck className="size-5 text-[#1e3a5f]" />
              <span>My Bookings</span>
            </Link>
            <div className="pt-4 border-t border-border">
              <Button className="w-full gap-2 bg-[#1e3a5f] hover:bg-[#152d4a]" asChild>
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
