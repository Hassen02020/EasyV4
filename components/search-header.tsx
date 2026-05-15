"use client"

import { Button } from "@/components/ui/button"
import { MapPin, Calendar, Users, ChevronDown, Search } from "lucide-react"
import Link from "next/link"
import { Easy2BookLogo } from "@/components/easy2book-logo"

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
              <span className="text-[#1e3a5f]">Easy</span>
              <span className="text-[#e5b94e]">2</span>
              <span className="text-[#1e3a5f]">Book</span>
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
          </div>
        </div>
      </div>
    </header>
  )
}
