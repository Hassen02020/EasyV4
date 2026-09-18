/**
 * Page Vols — /vols/search — Résultats
 *
 * Results Layer manquante identifiée dans EASYV4_SEARCH_ENGINES_AUDIT_REPORT.md
 * (finding CRITICAL #1) : cette route n'existait pas du tout, alors que
 * `components/vols/flight-search.tsx` y naviguait déjà — chaque recherche
 * se terminait donc en 404. Le moteur backend (`app/api/vols/search/route.ts`
 * → `lib/vols/client.ts`) existait déjà et n'a pas été reconstruit — cette
 * page se contente de l'appeler et d'afficher ce qu'il renvoie.
 *
 * Server Component (Header/Footer) enveloppant `FlightResultsContent`
 * (Client Component, useSearchParams/useState) : `HeaderWrapper` lit les
 * cookies via `next/headers`, incompatible avec un composant client — même
 * séparation que `app/vols/page.tsx` / `app/transferts/resultats/page.tsx`.
 */

import { Suspense } from "react"
import { Loader2 } from "lucide-react"
import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { FlightResultsContent } from "./flight-results-content"

export default function VolsSearchPage() {
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
          <FlightResultsContent />
        </Suspense>
      </div>
      <Footer />
    </div>
  )
}
