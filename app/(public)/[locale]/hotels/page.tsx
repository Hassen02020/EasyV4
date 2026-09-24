import { getTranslations } from "next-intl/server"
import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { HotelsTunisieSearch } from "@/components/hotels-tunisie-search"
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
        <div className="bg-gradient-to-br from-blue-900 to-blue-700 px-4 py-12 text-white">
          <div className="mx-auto max-w-4xl text-center">
            <p className="mb-2 text-sm font-medium tracking-widest text-blue-300 uppercase">
              {t("kicker")}
            </p>
            <h1 className="mb-4 text-3xl font-bold md:text-4xl">
              {t("heroTitle")}
            </h1>
            <p className="mx-auto max-w-2xl text-blue-100">
              {t("heroSubtitle")}
            </p>
          </div>
        </div>
        <div className="mx-auto max-w-4xl px-4 py-10">
          <HotelsTunisieSearch />
        </div>
      </main>
      <Footer />
    </div>
  )
}
