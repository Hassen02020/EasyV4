/**
 * Page Hôtels Monde — /hotels-monde
 */

import { Globe } from "lucide-react"
import { getTranslations } from "next-intl/server"
import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { WorldHotelSearch } from "@/components/hotels-monde/world-hotel-search"
import { ModuleHero } from "@/components/module-hero"
import { buildLanguageAlternates } from "@/lib/seo/alternate-languages"

export const metadata = {
  title: "Hôtels Monde | Easy2Book",
  description:
    "Réservez des hôtels partout dans le monde. Plus de 1 million d'établissements. Meilleur prix garanti.",
  alternates: { languages: buildLanguageAlternates("/hotels-monde") },
}

interface HotelsMondeSearchParams {
  destination?: string
  checkIn?: string
  checkOut?: string
}

export default async function HotelsMondeePage({
  searchParams,
}: {
  searchParams: Promise<HotelsMondeSearchParams>
}) {
  const { destination, checkIn, checkOut } = await searchParams
  const t = await getTranslations("HotelsMonde")

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 bg-muted/30">
        <ModuleHero
          Icon={Globe}
          gradient="from-indigo-900 to-indigo-700"
          kicker={t("kicker")}
          title={t("heroTitle")}
          subtitle={t("heroSubtitle")}
        />
        <div className="mx-auto max-w-4xl px-4 py-10">
          <WorldHotelSearch
            initialDestination={destination}
            initialCheckIn={checkIn}
            initialCheckOut={checkOut}
          />
        </div>
      </main>
      <Footer />
    </div>
  )
}
