/**
 * Page de résultats « Hôtels Monde » — /hotels-monde/search
 *
 * Le GDS mondial n'étant pas encore branché, cette page récapitule la
 * recherche (destination, dates, nombre de nuits, voyageurs) et permet de
 * relancer une recherche. Elle évite surtout un 404 sur le bouton Rechercher.
 */

import { CalendarDays, Globe, Moon, Users } from "lucide-react"

import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { WorldHotelSearch } from "@/components/hotels-monde/world-hotel-search"
import { findWorldDestination } from "@/lib/hotels/world-destinations"

export const metadata = {
  title: "Résultats Hôtels Monde | Easy2Book",
}

function nights(checkIn?: string, checkOut?: string): number {
  if (!checkIn || !checkOut) return 0
  const a = new Date(checkIn)
  const b = new Date(checkOut)
  const diff = Math.round((b.getTime() - a.getTime()) / 86_400_000)
  return diff > 0 ? diff : 0
}

function formatDate(value?: string): string {
  if (!value) return "—"
  const d = new Date(value)
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
}

export default async function HotelsMondeSearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const get = (k: string): string | undefined => {
    const v = sp[k]
    return Array.isArray(v) ? v[0] : v
  }

  const slug = get("destination")
  const dest = findWorldDestination(slug)
  const label = get("label") ?? (dest ? `${dest.city}, ${dest.country}` : "—")
  const checkIn = get("checkIn")
  const checkOut = get("checkOut")
  const adults = get("adults") ?? "2"
  const rooms = get("rooms") ?? "1"
  const n = nights(checkIn, checkOut)

  const initialDestination = dest
    ? {
        value: dest.value,
        label: dest.city,
        sublabel: dest.country,
        group: dest.region,
      }
    : null

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="bg-muted/30 flex-1">
        <div className="bg-gradient-to-br from-teal-900 to-teal-700 px-4 py-10 text-white">
          <div className="mx-auto max-w-4xl">
            <p className="mb-1 flex items-center gap-2 text-sm font-medium tracking-widest text-teal-300 uppercase">
              <Globe className="size-4" /> Hôtels Monde
            </p>
            <h1 className="mb-4 text-2xl font-bold md:text-3xl">{label}</h1>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-teal-50">
              <span className="flex items-center gap-1.5">
                <CalendarDays className="size-4" />
                {formatDate(checkIn)} → {formatDate(checkOut)}
              </span>
              <span className="flex items-center gap-1.5">
                <Moon className="size-4" />
                {n} nuit{n > 1 ? "s" : ""}
              </span>
              <span className="flex items-center gap-1.5">
                <Users className="size-4" />
                {adults} adulte{Number(adults) > 1 ? "s" : ""} · {rooms} chambre
                {Number(rooms) > 1 ? "s" : ""}
              </span>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-4xl space-y-8 px-4 py-10">
          <WorldHotelSearch initialDestination={initialDestination} />

          <div className="bg-card rounded-2xl border border-dashed p-10 text-center">
            <Globe className="text-muted-foreground mx-auto mb-3 size-8" />
            <h2 className="text-lg font-semibold">
              Recherche enregistrée pour {label}
            </h2>
            <p className="text-muted-foreground mx-auto mt-2 max-w-md text-sm">
              La connexion au GDS mondial (Amadeus / WebBeds) n&apos;est pas
              encore active sur cet environnement. Les disponibilités réelles
              s&apos;afficheront ici une fois le fournisseur branché.
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
