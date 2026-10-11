import Link from "next/link"
import { Home, SearchX } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * Locale-level not-found boundary.
 *
 * Short-circuits the speculative full-page render (layout DB queries +
 * homepage RSC) that Next.js would otherwise run on any valid-locale path
 * with no matching page segment — e.g. bot probes, broken links, or scanner
 * traffic. Without this file every 404 still hits getRequestTenantInfo() and
 * getDefaultAgencyId() before the router can resolve to a 404.
 * See ROADMAP NOT_FOUND-PERF-01.
 */
export default function LocaleNotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="bg-background h-16 border-b" />

      <main className="bg-muted/30 flex flex-1 items-center justify-center px-4 py-16">
        <div className="max-w-md text-center">
          <div className="bg-muted mx-auto flex h-16 w-16 items-center justify-center rounded-full">
            <SearchX className="text-muted-foreground h-8 w-8" />
          </div>

          <h1 className="text-foreground mt-6 text-2xl font-bold">
            Page introuvable
          </h1>

          <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
            La page que vous recherchez n&apos;existe pas ou a été déplacée.
            Retournez à l&apos;accueil pour continuer votre recherche.
          </p>

          <div className="mt-8">
            <Button asChild>
              <Link href="/">
                <Home className="mr-2 h-4 w-4" />
                Retour à l&apos;accueil
              </Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  )
}
