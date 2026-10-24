import { Building2 } from "lucide-react"
import { getTranslations } from "next-intl/server"
import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { HotelsTunisieSearch } from "@/components/hotels-tunisie-search"
import { ModuleHero } from "@/components/module-hero"
import { buildModuleMetadata } from "@/lib/seo/module-metadata"
import { getPublicModuleVisual } from "@/lib/public/site-content"

export const dynamic = "force-dynamic"

export function generateMetadata() {
  return buildModuleMetadata("Hotels", "/hotels")
}

export default async function HotelsTunisiePage() {
  const [t, visual] = await Promise.all([
    getTranslations("Hotels"),
    getPublicModuleVisual("hotels-tunisie"),
  ])

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="bg-muted/30 flex-1">
        <ModuleHero
          Icon={Building2}
          gradient="from-blue-900 to-blue-700"
          imageUrl={visual?.heroImageUrl ?? "/images/hotels-banner.svg"}
          kicker={t("kicker")}
          title={t("heroTitle")}
          subtitle={t("heroSubtitle")}
        />
        <div className="mx-auto max-w-4xl px-4 py-10">
          <HotelsTunisieSearch />
        </div>
      </main>
      <Footer />
    </div>
  )
}
