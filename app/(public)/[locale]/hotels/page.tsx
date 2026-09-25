import { Building2 } from "lucide-react"
import { getTranslations } from "next-intl/server"
import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { HotelsTunisieSearch } from "@/components/hotels-tunisie-search"
import { ModuleHero } from "@/components/module-hero"
import { buildLanguageAlternates } from "@/lib/seo/alternate-languages"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Hôtels Tunisie | Easy2Book",
  description:
    "Réservez votre hôtel en Tunisie au meilleur prix. Comparez Hammamet, Sousse, Djerba, Monastir. Annulation gratuite.",
  alternates: { languages: buildLanguageAlternates("/hotels") },
}

export default async function HotelsTunisiePage() {
  const t = await getTranslations("Hotels")

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 bg-muted/30">
        <ModuleHero
          Icon={Building2}
          gradient="from-blue-900 to-blue-700"
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
