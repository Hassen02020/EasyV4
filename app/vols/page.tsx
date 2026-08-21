/**
 * Page Vols — /vols
 *
 * Landing + formulaire de recherche. Si l'URL contient déjà des paramètres
 * de recherche valides (ex. venant du widget rapide de la homepage), on ne
 * réaffiche PAS le formulaire comme écran principal — on relance
 * directement la recherche en redirigeant vers la vraie page de résultats
 * `/vols/search`, seule route canonique des résultats (voir
 * EASYV4_SEARCH_ENGINES_AUDIT_REPORT.md — c'était l'anti-pattern "double
 * couche de recherche" : `/vols` réaffichait un formulaire au lieu de
 * lancer la recherche, et le formulaire visait une route `/vols/search`
 * qui n'existait pas encore).
 */

import { redirect } from "next/navigation"
import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { FlightSearch } from "@/components/vols/flight-search"
import {
  parseFlightSearchParams,
  flightStateToResultsParams,
} from "@/lib/vols/search-state"

export const metadata = {
  title: "Recherche de Vols | Easy2Book",
  description:
    "Comparez et réservez vos vols au départ de Tunis et des aéroports tunisiens. Meilleurs tarifs garantis.",
}

interface VolsSearchParams {
  [key: string]: string | string[] | undefined
}

export default async function VolsPage({
  searchParams,
}: {
  searchParams: Promise<VolsSearchParams>
}) {
  const rawParams = await searchParams
  const asRecord: Record<string, string> = {}
  for (const [key, value] of Object.entries(rawParams)) {
    if (typeof value === "string") asRecord[key] = value
  }
  const urlParams = new URLSearchParams(asRecord)

  const parsed = parseFlightSearchParams(urlParams)
  if (parsed.ok) {
    redirect(`/vols/search?${flightStateToResultsParams(parsed.state).toString()}`)
  }

  // Params absents ou invalides (ex. premier passage sur /vols sans
  // recherche, ou origin===destination) → formulaire, pré-rempli au mieux
  // avec ce qui a pu être compris (comportement inchangé pour ce cas).
  const params = {
    origin: typeof rawParams.origin === "string" ? rawParams.origin : undefined,
    destination:
      typeof rawParams.destination === "string" ? rawParams.destination : undefined,
    class:
      typeof rawParams.cabin === "string"
        ? rawParams.cabin
        : typeof rawParams.class === "string"
          ? rawParams.class
          : undefined,
    adults: typeof rawParams.adults === "string" ? rawParams.adults : undefined,
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 bg-muted/30">
        <div className="bg-gradient-to-br from-sky-900 to-sky-700 px-4 py-12 text-white">
          <div className="mx-auto max-w-4xl text-center">
            <p className="mb-2 text-sm font-medium tracking-widest text-sky-300 uppercase">
              Module Vols
            </p>
            <h1 className="mb-4 text-3xl font-bold md:text-4xl">
              Réservez votre vol
            </h1>
            <p className="mx-auto max-w-2xl text-sky-100">
              Vols aller-simple ou aller-retour depuis les aéroports tunisiens.
              Économique, Affaires ou Première classe.
            </p>
          </div>
        </div>

        <div className="mx-auto max-w-4xl px-4 py-10">
          <FlightSearch
            initialOrigin={params.origin}
            initialDestination={params.destination}
            initialCabin={params.class}
            initialAdults={params.adults}
          />
        </div>
      </main>
      <Footer />
    </div>
  )
}
