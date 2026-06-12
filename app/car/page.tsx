/**
 * Page Location de voiture — /car
 */

import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { CarSearch } from "@/components/car/car-search"

export const metadata = {
  title: "Location de Voiture | Easy2Book",
  description:
    "Louez une voiture en Tunisie au meilleur prix. Berline, SUV, minibus. Prise en charge aéroport ou agence.",
}

export default function CarPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 bg-muted/30">
        <div className="bg-gradient-to-br from-orange-900 to-orange-700 px-4 py-12 text-white">
          <div className="mx-auto max-w-4xl text-center">
            <p className="mb-2 text-sm font-medium tracking-widest text-orange-300 uppercase">
              Location de Voiture
            </p>
            <h1 className="mb-4 text-3xl font-bold md:text-4xl">
              Louez votre voiture
            </h1>
            <p className="mx-auto max-w-2xl text-orange-100">
              Flotte récente, assurance incluse. Prise en charge aéroport,
              agences dans toute la Tunisie.
            </p>
          </div>
        </div>
        <div className="mx-auto max-w-4xl px-4 py-10">
          <CarSearch />
        </div>
      </main>
      <Footer />
    </div>
  )
}
