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

export const dynamic = "force-dynamic"

export default async function Home() {
  const [modules, site] = await Promise.all([
    getPublicModuleVisuals(),
    getPublicSiteConfig(),
  ])

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <BookingEngine modules={modules} heroImageUrl={site?.heroImageUrl} />
        <FlashOffers />
        <OmratySection />
        <FeaturedDestinationsSection />
        <DevelopmentProjectsSection />
        <MarketSignalsSection />
      </main>
      <Footer />
    </div>
  )
}
