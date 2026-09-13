"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { parseISO } from "date-fns"
import { Button } from "@/components/ui/button"
import { MapPin, Calendar, Users, Search, User } from "lucide-react"
import { Link } from "@/i18n/navigation"
import { Easy2BookLogo } from "@/components/easy2book-logo"
import { CartBadgeLink } from "@/components/cart/cart-badge-link"
import { createBrowserSupabase } from "@/lib/supabase/client"
import { useTranslations } from "next-intl"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { HotelsTunisieSearch } from "@/components/hotels-tunisie-search"

interface SearchHeaderProps {
  city?: string
  dateRange?: string
  paxLabel?: string
}

export function SearchHeader({
  city,
  dateRange,
  paxLabel,
}: SearchHeaderProps) {
  const t = useTranslations("Common")
  const tHotels = useTranslations("Hotels")
  const [loggedIn, setLoggedIn] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const resolvedCity = city ?? "Hammamet, Tunisie"
  const resolvedDateRange = dateRange ?? tHotels("selectDates")
  const resolvedPaxLabel = paxLabel ?? tHotels("paxAdultsCount", { n: 2 })

  // Préremplissage du widget "Modifier" depuis la recherche courante (mêmes
  // clés d'URL que HotelsTunisieSearch.handleSearch, voir ce fichier).
  const searchParams = useSearchParams()
  const cityId = searchParams.get("cityId")
  const cityParam = searchParams.get("city")
  const checkinStr = searchParams.get("checkin")
  const checkoutStr = searchParams.get("checkout")
  const roomsCount = Number(searchParams.get("roomsCount") ?? "1")
  const adultsCount = Number(searchParams.get("adults") ?? "2")
  const childrenAgesParam = (searchParams.get("children") ?? "")
    .split(",")
    .map((a) => parseInt(a, 10))
    .filter((n) => Number.isFinite(n))
  const starsParam = (searchParams.get("stars") ?? "")
    .split(",")
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isFinite(n))
  const onlyAvailableParam = searchParams.get("onlyAvailable") !== "0"
  const parseUrlDate = (value: string | null) => {
    if (!value) return undefined
    try {
      return parseISO(value)
    } catch {
      return undefined
    }
  }

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
            aria-label={tHotels("logoHomeAria")}
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
                    {resolvedCity}
                  </span>
                </div>
              </div>

              <div className="bg-border hidden h-6 w-px md:block" />

              <div className="hidden items-center gap-2 px-3 py-2 md:flex">
                <Calendar className="text-primary h-4 w-4 shrink-0" />
                <div>
                  <span className="text-foreground text-sm font-medium">
                    {resolvedDateRange}
                  </span>
                </div>
              </div>

              <div className="bg-border hidden h-6 w-px md:block" />

              <div className="hidden items-center gap-2 px-3 py-2 md:flex">
                <Users className="text-primary h-4 w-4 shrink-0" />
                <div>
                  <span className="text-foreground text-sm font-medium">
                    {resolvedPaxLabel}
                  </span>
                </div>
              </div>

              <Button size="sm" className="shrink-0" onClick={() => setEditOpen(true)}>
                <Search className="h-4 w-4" />
                <span className="ml-1 hidden sm:inline">{tHotels("modifyButton")}</span>
              </Button>
            </div>
          </div>

          <div className="hidden items-center gap-4 lg:flex">
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

      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent side="top" className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{tHotels("modifyButton")}</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-6">
            <HotelsTunisieSearch
              initialCity={
                cityId && cityParam
                  ? { id: Number(cityId), name: cityParam }
                  : null
              }
              initialCheckin={parseUrlDate(checkinStr)}
              initialCheckout={parseUrlDate(checkoutStr)}
              initialRooms={Number.isFinite(roomsCount) ? roomsCount : 1}
              initialAdults={Number.isFinite(adultsCount) ? adultsCount : 2}
              initialChildrenAges={childrenAgesParam}
              initialOnlyAvailable={onlyAvailableParam}
              initialStars={starsParam}
              onSearchSubmit={() => setEditOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>
    </header>
  )
}
