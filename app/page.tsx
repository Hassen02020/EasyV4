import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { BookingEngine } from "@/components/booking-engine"
import { FlashOffers } from "@/components/flash-offers"
import { OmratySection } from "@/components/omraty-section"
import { Footer } from "@/components/footer"
import { getDb } from "@/lib/db/client"
import { catalogTransferZones } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export const dynamic = "force-dynamic"

async function getActiveTransferZones() {
  try {
    const db = getDb()
    return await db
      .select()
      .from(catalogTransferZones)
      .where(eq(catalogTransferZones.status, "active"))
      .orderBy(catalogTransferZones.name)
  } catch {
    return []
  }
}

export default async function Home() {
  const transferZones = await getActiveTransferZones()

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <BookingEngine transferZones={transferZones} />
        <FlashOffers />
        <OmratySection />
      </main>
      <Footer />
    </div>
  )
}
