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

/** Wraps a promise with a 1 s fallback; logs when the timeout fires so Vercel
 *  logs expose slow/failed DB queries that would otherwise be silently swallowed. */
function withFallback<T>(
  label: string,
  promise: Promise<T>,
  fallback: T,
): Promise<T> {
  let settled = false
  const settled$ = promise.then(
    (v) => {
      settled = true
      return v
    },
    () => {
      settled = true
      return fallback
    },
  )
  const timeout$ = new Promise<T>((r) =>
    setTimeout(() => {
      if (!settled) {
        console.warn(
          `[homepage] DB timeout (1 000 ms) — ${label} using fallback`,
        )
      }
      r(fallback)
    }, 1000),
  )
  return Promise.race([settled$, timeout$])
}

export default async function Home() {
  const [modules, site, transferZones, carCatalog] = await Promise.all([
    withFallback("getPublicModuleVisuals", getPublicModuleVisuals(), []),
    withFallback("getPublicSiteConfig", getPublicSiteConfig(), null),
    withFallback("getActiveTransferZones", getActiveTransferZones(), []),
    withFallback("getActiveCarCatalog", getActiveCarCatalog(), {
      agencyId: null,
      locations: [],
      categories: [],
    } as Awaited<ReturnType<typeof getActiveCarCatalog>>),
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
        <Suspense fallback={<div className="bg-muted/40 h-64 animate-pulse" />}>
          <FlashOffers />
        </Suspense>
        <OmratySection />
        <Suspense fallback={<div className="bg-muted/40 h-64 animate-pulse" />}>
          <FeaturedDestinationsSection />
        </Suspense>
        <Suspense fallback={<div className="bg-muted/40 h-48 animate-pulse" />}>
          <DevelopmentProjectsSection />
        </Suspense>
        <Suspense fallback={<div className="bg-muted/40 h-48 animate-pulse" />}>
          <MarketSignalsSection />
        </Suspense>
      </main>
      <Footer />
    </div>
  )
}
