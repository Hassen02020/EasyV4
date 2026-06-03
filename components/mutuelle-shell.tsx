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
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

const NAV_ITEMS = [
  { href: "/mutuelle", label: "Dashboard", icon: HeartHandshake },
  { href: "/mutuelle/dossiers", label: "Dossiers Assurés", icon: Users },
  { href: "/mutuelle/factures", label: "Factures", icon: FileText },
  { href: "/mutuelle/parametres", label: "Paramètres", icon: Settings },
]

interface MutuelleShellProps {
  displayName: string
  email: string
  children: ReactNode
}

export function MutuelleShell({ displayName, email, children }: MutuelleShellProps) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  async function handleLogout() {
    const supabase = createBrowserSupabase()
    await supabase.auth.signOut()
    window.location.href = "/mutuelle/login"
  }

  return (
    <div className="bg-background flex min-h-screen">
      {/* Sidebar desktop */}
      <aside className="border-border bg-card hidden w-60 shrink-0 flex-col border-r lg:flex">
        <div className="flex h-16 items-center gap-3 border-b px-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100">
            <HeartHandshake className="h-5 w-5 text-violet-600" />
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
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-violet-600 text-white"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
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
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100">
              <span className="text-violet-600 text-xs font-bold">
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
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100">
              <HeartHandshake className="h-4 w-4 text-violet-600" />
            </div>
            <span className="text-foreground text-sm font-semibold">Mutuelle</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
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
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                      active
                        ? "bg-violet-600 text-white"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
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
