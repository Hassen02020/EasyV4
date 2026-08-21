/**
 * Page Hôtels Monde — /hotels-monde/search — Résultats
 *
 * Results Layer manquante : `components/hotels-monde/world-hotel-search.tsx`
 * naviguait déjà vers cette route, qui n'existait pas — chaque recherche se
 * terminait donc en 404. Même correction et même pattern que
 * `app/vols/search/page.tsx` (moteur backend + résultats démo honnêtement
 * labellisés, réservation désactivée tant qu'aucun fournisseur réel
 * — Expedia/Booking — n'est branché, voir lib/hotels-monde/client.ts).
 *
 * Server Component (Header/Footer) enveloppant `WorldHotelResultsContent`
 * (Client Component, useSearchParams/useState) — même séparation que
 * app/vols/search/page.tsx.
 */

import { Suspense } from "react"
import { Loader2 } from "lucide-react"
import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { WorldHotelResultsContent } from "./world-hotel-results-content"

export default function HotelsMondeSearchPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <div className="flex-1 bg-muted/30">
        <Suspense
          fallback={
            <main className="mx-auto flex max-w-5xl items-center justify-center px-4 py-24">
              <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
            </main>
          }
        >
          <WorldHotelResultsContent />
        </Suspense>
      </div>
      <Footer />
    </div>
  )
}
