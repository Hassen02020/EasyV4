import { Suspense } from "react"
import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { BookingEngine } from "@/components/booking-engine"
import { FlashOffers } from "@/components/flash-offers"
import { OmratySection } from "@/components/omraty-section"
import { FeaturedDestinationsSection } from "@/components/featured-destinations-section"
import { DevelopmentProjectsSection } from "@/components/development-projects-section"
import { MarketSignalsSection } from "@/components/market-signals-section"
import { Footer } from "@/components/footer"
import {
  getPublicModuleVisuals,
  getPublicSiteConfig,
} from "@/lib/public/site-content"
import { getActiveTransferZones } from "@/lib/transfers/catalog"
import { getActiveCarCatalog } from "@/lib/cars/catalog"

export const dynamic = "force-dynamic"

export default async function Home() {
  // Cap each DB call at 1 s so the page never stalls when postgres-js is
  // reconnecting. Fallbacks render the shell without dynamic data.
  const [modules, site, transferZones, carCatalog] = await Promise.all([
    Promise.race([
      getPublicModuleVisuals().catch(() => []),
      new Promise<never[]>((r) => setTimeout(() => r([]), 1000)),
    ]),
    Promise.race([
      getPublicSiteConfig().catch(() => null),
      new Promise<null>((r) => setTimeout(() => r(null), 1000)),
    ]),
    Promise.race([
      getActiveTransferZones().catch(() => []),
      new Promise<never[]>((r) => setTimeout(() => r([]), 1000)),
    ]),
    Promise.race([
      getActiveCarCatalog().catch(() => ({ locations: [], categories: [] })),
      new Promise<{ locations: never[]; categories: never[] }>((r) =>
        setTimeout(() => r({ locations: [], categories: [] }), 1000),
      ),
    ]),
  ])

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <BookingEngine
          modules={modules}
          heroImageUrl={site?.heroImageUrl}
          transferZones={transferZones}
          carLocations={carCatalog.locations}
        />
        <Suspense fallback={<div className="h-64 animate-pulse bg-muted/40" />}>
          <FlashOffers />
        </Suspense>
        <OmratySection />
        <Suspense fallback={<div className="h-64 animate-pulse bg-muted/40" />}>
          <FeaturedDestinationsSection />
        </Suspense>
        <Suspense fallback={<div className="h-48 animate-pulse bg-muted/40" />}>
          <DevelopmentProjectsSection />
        </Suspense>
        <Suspense fallback={<div className="h-48 animate-pulse bg-muted/40" />}>
          <MarketSignalsSection />
        </Suspense>
      </main>
      <Footer />
    </div>
  )
}
