import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { BookingEngine } from "@/components/booking-engine"
import { FlashOffers } from "@/components/flash-offers"
import { OmratySection } from "@/components/omraty-section"
import { MarketSignalsSection } from "@/components/market-signals-section"
import { Footer } from "@/components/footer"

export const dynamic = "force-dynamic"

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <BookingEngine />
        <FlashOffers />
        <OmratySection />
        <MarketSignalsSection />
      </main>
      <Footer />
    </div>
  )
}
