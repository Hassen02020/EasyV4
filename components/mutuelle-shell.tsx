"use client"

import { useState, type ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  HeartHandshake,
  FileText,
  Users,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronRight,
} from "lucide-react"
import { createBrowserSupabase } from "@/lib/supabase/client"
import { clearUserRoleCookie } from "@/app/actions/validate-role"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

const NAV_ITEMS = [
  { href: "/mutuelle", label: "Dashboard", icon: HeartHandshake, disabled: false },
  { href: "/mutuelle/dossiers", label: "Dossiers Assurés", icon: Users, disabled: true },
  { href: "/mutuelle/factures", label: "Factures", icon: FileText, disabled: true },
  { href: "/mutuelle/parametres", label: "Paramètres", icon: Settings, disabled: true },
]

/** Violet-600/violet-100 (Tailwind), la teinte fixe du portail avant ce chantier — valeur de repli si `accentColor` est absent/invalide. */
const DEFAULT_ACCENT = "#7c3aed"
const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/

/** '#rrggbb' -> 'rgba(r,g,b,alpha)' — évite de dépendre du support navigateur de color-mix() pour la teinte claire (ex-bg-violet-100). */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

interface MutuelleShellProps {
  displayName: string
  email: string
  /** agencies.primary_color de l'agence de l'agent connecté — voir app/(internal)/mutuelle/(app)/layout.tsx. `null`/invalide = violet par défaut inchangé. */
  accentColor?: string | null
  children: ReactNode
}

export function MutuelleShell({
  displayName,
  email,
  accentColor,
  children,
}: MutuelleShellProps) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  const accent = accentColor && HEX_COLOR_REGEX.test(accentColor) ? accentColor : DEFAULT_ACCENT
  const accentTint = hexToRgba(accent, 0.12)

  async function handleLogout() {
    const supabase = createBrowserSupabase()
    await supabase.auth.signOut()
    // Sinon le cookie de rôle posé par /login/select survit à la
    // déconnexion et pourrait fausser le routage du prochain utilisateur
    // sur ce même navigateur (voir app/api/auth/signout/route.ts).
    await clearUserRoleCookie()
    window.location.href = "/mutuelle/login"
  }

  return (
    <div className="bg-background flex min-h-screen">
      {/* Sidebar desktop */}
      <aside className="border-border bg-card hidden w-60 shrink-0 flex-col border-r lg:flex">
        <div className="flex h-16 items-center gap-3 border-b px-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: accentTint }}>
            <HeartHandshake className="h-5 w-5" style={{ color: accent }} />
          </div>
          <div className="min-w-0">
            <p className="text-foreground truncate text-sm font-semibold">
              Espace Mutuelle
            </p>
            <p className="text-muted-foreground truncate text-xs">Partenaire</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const active =
              item.href === "/mutuelle"
                ? pathname === "/mutuelle"
                : pathname.startsWith(item.href)
            if (item.disabled) {
              return (
                <span
                  key={item.href}
                  title="Pas encore disponible"
                  className="text-muted-foreground/50 flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium"
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </span>
              )
            }
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  active ? "text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
                style={active ? { backgroundColor: accent } : undefined}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
                {active && <ChevronRight className="ml-auto h-3 w-3" />}
              </Link>
            )
          })}
        </nav>

        <div className="border-border border-t px-3 py-4">
          <div className="mb-3 flex items-center gap-3 px-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: accentTint }}>
              <span className="text-xs font-bold" style={{ color: accent }}>
                {displayName.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-foreground truncate text-sm font-medium">
                {displayName}
              </p>
              <p className="text-muted-foreground text-xs">{email}</p>
            </div>
          </div>
          <Separator className="mb-3" />
          <button
            onClick={handleLogout}
            className="text-muted-foreground hover:text-destructive flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Déconnexion
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="flex flex-1 flex-col">
        <header className="border-border bg-card flex h-14 items-center justify-between border-b px-4 lg:hidden">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: accentTint }}>
              <HeartHandshake className="h-4 w-4" style={{ color: accent }} />
            </div>
            <span className="text-foreground text-sm font-semibold">
              Mutuelle
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={mobileOpen ? "Fermer le menu" : "Ouvrir le menu"}
          >
            {mobileOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </Button>
        </header>

        {/* Mobile nav drawer */}
        {mobileOpen && (
          <div className="border-border bg-card border-b lg:hidden">
            <nav className="space-y-1 px-3 py-3">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon
                const active =
                  item.href === "/mutuelle"
                    ? pathname === "/mutuelle"
                    : pathname.startsWith(item.href)
                if (item.disabled) {
                  return (
                    <span
                      key={item.href}
                      title="Pas encore disponible"
                      className="text-muted-foreground/50 flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium"
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </span>
                  )
                }
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                      active ? "text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                    style={active ? { backgroundColor: accent } : undefined}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                )
              })}
              <Separator />
              <button
                onClick={handleLogout}
                className="text-muted-foreground flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm"
              >
                <LogOut className="h-4 w-4" />
                Déconnexion
              </button>
            </nav>
          </div>
        )}

        {/* Main content */}
        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  )
}
