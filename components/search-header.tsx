"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { MapPin, Calendar, Users, ChevronDown, Search, User } from "lucide-react"
import Link from "next/link"
import { Easy2BookLogo } from "@/components/easy2book-logo"
import { CartBadgeLink } from "@/components/cart/cart-badge-link"
import { createBrowserSupabase } from "@/lib/supabase/client"
import { useT } from "@/components/locale-context"

interface SearchHeaderProps {
  city?: string
  dateRange?: string
  paxLabel?: string
}

export function SearchHeader({
  city = "Hammamet, Tunisie",
  dateRange = "Sélectionner les dates",
  paxLabel = "2 Adultes",
}: SearchHeaderProps) {
  const t = useT()
  const [loggedIn, setLoggedIn] = useState(false)

  useEffect(() => {
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
  }, [])

  return (
    <header className="bg-card border-border sticky top-0 z-50 border-b shadow-sm">
      <div className="mx-auto max-w-7xl px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="flex items-center gap-2"
            aria-label="Easy2Book — retour à l'accueil"
          >
            <Easy2BookLogo className="size-10" />
            <span className="hidden text-xl font-bold sm:block">
              <span className="text-sidebar">Easy</span>
              <span className="text-accent">2</span>
              <span className="text-sidebar">Book</span>
            </span>
          </Link>

          <div className="max-w-3xl flex-1">
            <div className="bg-secondary flex items-center gap-1 rounded-lg p-1">
              <div className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2">
                <MapPin className="text-primary h-4 w-4 shrink-0" />
                <div className="truncate">
                  <span className="text-foreground text-sm font-medium">
                    {city}
                  </span>
                </div>
              </div>

              <div className="bg-border hidden h-6 w-px md:block" />

              <div className="hidden items-center gap-2 px-3 py-2 md:flex">
                <Calendar className="text-primary h-4 w-4 shrink-0" />
                <div>
                  <span className="text-foreground text-sm font-medium">
                    {dateRange}
                  </span>
                </div>
              </div>

              <div className="bg-border hidden h-6 w-px md:block" />

              <div className="hidden items-center gap-2 px-3 py-2 md:flex">
                <Users className="text-primary h-4 w-4 shrink-0" />
                <div>
                  <span className="text-foreground text-sm font-medium">
                    {paxLabel}
                  </span>
                </div>
              </div>

              <Button size="sm" className="shrink-0">
                <Search className="h-4 w-4" />
                <span className="ml-1 hidden sm:inline">Modifier</span>
              </Button>
            </div>
          </div>

          <div className="hidden items-center gap-4 lg:flex">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Afficher :</span>
              <button className="text-foreground hover:text-primary flex items-center gap-1 font-medium">
                100 hôtels
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Trier :</span>
              <button className="text-foreground hover:text-primary flex items-center gap-1 font-medium">
                Recommandé
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
            <div className="bg-border h-6 w-px" />
            <CartBadgeLink variant="desktop" />
            <Button variant="outline" size="sm" className="gap-1.5" asChild>
              <Link href="/compte">
                <User className="size-4" />
                {loggedIn ? t("monCompte") : t("connexion")}
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </header>
  )
}
