/**
 * Page Hôtels Monde — /hotels-monde
 */

import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { WorldHotelSearch } from "@/components/hotels-monde/world-hotel-search"

export const metadata = {
  title: "Hôtels Monde | Easy2Book",
  description:
    "Réservez des hôtels partout dans le monde. Plus de 1 million d'établissements. Meilleur prix garanti.",
}

export default function HotelsMondeePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 bg-muted/30">
        <div className="bg-gradient-to-br from-teal-900 to-teal-700 px-4 py-12 text-white">
          <div className="mx-auto max-w-4xl text-center">
            <p className="mb-2 text-sm font-medium tracking-widest text-teal-300 uppercase">
              Hôtels Monde
            </p>
            <h1 className="mb-4 text-3xl font-bold md:text-4xl">
              Hôtels partout dans le monde
            </h1>
            <p className="mx-auto max-w-2xl text-teal-100">
              Plus d'un million d'hôtels, apartments et villas. Comparez les prix
              et réservez en quelques clics.
            </p>
          </div>
        </div>
        <div className="mx-auto max-w-4xl px-4 py-10">
          <WorldHotelSearch />
        </div>
      </main>
      <Footer />
    </div>
  )
}
