"use client"

import { Button } from "@/components/ui/button"
import { MapPin, Calendar, Users, ChevronDown, Search } from "lucide-react"

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
    <header className="sticky top-0 z-50 bg-card border-b border-border shadow-sm">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-lg">E</span>
            </div>
            <span className="text-xl font-bold text-foreground hidden sm:block">Easy2Book</span>
          </div>

          <div className="flex-1 max-w-3xl">
            <div className="flex items-center bg-secondary rounded-lg p-1 gap-1">
              <div className="flex items-center gap-2 px-3 py-2 flex-1 min-w-0">
                <MapPin className="w-4 h-4 text-primary shrink-0" />
                <div className="truncate">
                  <span className="text-sm font-medium text-foreground">{city}</span>
                </div>
              </div>

              <div className="h-6 w-px bg-border hidden md:block" />

              <div className="hidden md:flex items-center gap-2 px-3 py-2">
                <Calendar className="w-4 h-4 text-primary shrink-0" />
                <div>
                  <span className="text-sm font-medium text-foreground">{dateRange}</span>
                </div>
              </div>

              <div className="h-6 w-px bg-border hidden md:block" />

              <div className="hidden md:flex items-center gap-2 px-3 py-2">
                <Users className="w-4 h-4 text-primary shrink-0" />
                <div>
                  <span className="text-sm font-medium text-foreground">{paxLabel}</span>
                </div>
              </div>

              <Button size="sm" className="shrink-0">
                <Search className="w-4 h-4" />
                <span className="hidden sm:inline ml-1">Modifier</span>
              </Button>
            </div>
          </div>

          <div className="hidden lg:flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Afficher :</span>
              <button className="flex items-center gap-1 text-foreground font-medium hover:text-primary">
                100 hôtels
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Trier :</span>
              <button className="flex items-center gap-1 text-foreground font-medium hover:text-primary">
                Recommandé
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
