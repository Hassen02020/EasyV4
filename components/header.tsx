"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { Phone, HelpCircle, User, Menu, X, Plane, Building2, Globe, Moon, Bus } from "lucide-react"
import { Button } from "@/components/ui/button"

const navLinks = [
  { id: "vols", label: "Vols", icon: Plane },
  { id: "hotels-tunisie", label: "Hôtels Tunisie", icon: Building2 },
  { id: "hotels-monde", label: "Hôtels Monde", icon: Globe },
  { id: "omraty", label: "Omraty", icon: Moon },
  { id: "transferts", label: "Transferts", icon: Bus },
]

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <>
      {/* Emergency Top Bar */}
      <div className="bg-[#1e3a5f] text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-10 text-sm">
            <div className="flex items-center gap-2">
              <HelpCircle className="size-4" />
              <span className="hidden sm:inline">Support client 7j/7</span>
              <span className="sm:hidden">Support 7j/7</span>
            </div>
            <a 
              href="tel:+21698140514" 
              className="flex items-center gap-2 font-semibold text-[#e5b94e] hover:text-[#f0c85d] transition-colors"
            >
              <Phone className="size-4" />
              <span>Urgence: +216 98 140 514</span>
            </a>
          </div>
        </div>
      </div>

      {/* Main Header */}
      <header className="bg-card border-b border-border sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2">
              <Image
                src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/IMG-20251114-WA0025-EuDkN9RXSmMocH0MBMWmAL5fpPoOrR.jpg"
                alt="Easy2Book"
                width={48}
                height={48}
                className="object-contain"
              />
              <span className="text-xl font-bold">
                <span className="text-[#1e3a5f]">Easy</span>
                <span className="text-[#e5b94e]">2</span>
                <span className="text-[#1e3a5f]">Book</span>
              </span>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center gap-1">
              {navLinks.map((link) => {
                const Icon = link.icon
                return (
                  <a
                    key={link.id}
                    href={`#${link.id}`}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-[#1e3a5f] hover:bg-muted/50 rounded-lg transition-colors"
                  >
                    <Icon className="size-4" />
                    <span>{link.label}</span>
                  </a>
                )
              })}
            </nav>

            {/* Right Actions */}
            <div className="flex items-center gap-3">
              <Button 
                variant="outline" 
                className="hidden sm:flex gap-2 border-[#1e3a5f] text-[#1e3a5f] hover:bg-[#1e3a5f] hover:text-white"
              >
                <User className="size-4" />
                Connexion
              </Button>

              {/* Mobile Menu Button */}
              <Button 
                variant="ghost" 
                size="icon" 
                className="lg:hidden"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? <X className="size-6" /> : <Menu className="size-6" />}
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-border bg-card">
            <nav className="max-w-7xl mx-auto px-4 py-4 space-y-1">
              {navLinks.map((link) => {
                const Icon = link.icon
                return (
                  <a
                    key={link.id}
                    href={`#${link.id}`}
                    className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-foreground hover:bg-muted rounded-lg transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Icon className="size-5 text-[#1e3a5f]" />
                    <span>{link.label}</span>
                  </a>
                )
              })}
              <div className="pt-4 border-t border-border">
                <Button className="w-full gap-2 bg-[#1e3a5f] hover:bg-[#152d4a]">
                  <User className="size-4" />
                  Connexion
                </Button>
              </div>
            </nav>
          </div>
        )}
      </header>
    </>
  )
}
