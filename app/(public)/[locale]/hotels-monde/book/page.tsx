/**
 * Page Hôtels Monde — /hotels-monde/book — Réservation
 *
 * Même séparation Server/Client que app/vols/book/page.tsx : HeaderWrapper
 * lit les cookies via next/headers, incompatible avec le composant client
 * (useSearchParams) qui affiche le formulaire.
 */

import { Suspense } from "react"
import { Loader2 } from "lucide-react"
import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { WorldHotelBookingContent } from "./world-hotel-booking-content"

export default function HotelsMondeBookPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <div className="flex-1 bg-muted/30">
        <Suspense
          fallback={
            <main className="mx-auto flex max-w-3xl items-center justify-center px-4 py-24">
              <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
            </main>
          }
        >
          <WorldHotelBookingContent />
        </Suspense>
      </div>
      <Footer />
    </div>
  )
}
