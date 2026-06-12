/**
 * Page Vols — /vols
 */

import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { FlightSearch } from "@/components/vols/flight-search"

export const metadata = {
  title: "Recherche de Vols | Easy2Book",
  description:
    "Comparez et réservez vos vols au départ de Tunis et des aéroports tunisiens. Meilleurs tarifs garantis.",
}

export default function VolsPage() {
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
          <FlightSearch />
        </div>
      </main>
      <Footer />
    </div>
  )
}
