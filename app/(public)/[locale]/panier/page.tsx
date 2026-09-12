/**
 * Panier multi-produits B2C — /panier
 *
 * Voir lib/cart/cart-types.ts pour la décision de portée (Hôtel/Package/
 * Activité seulement, localStorage, pas de compte requis).
 */

import { getTranslations } from "next-intl/server"
import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { CartView } from "@/components/cart/cart-view"
import { buildLanguageAlternates } from "@/lib/seo/alternate-languages"

export const metadata = {
  title: "Mon panier | Easy2Book",
  alternates: { languages: buildLanguageAlternates("/panier") },
}

export default async function CartPage() {
  const t = await getTranslations("Panier")
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="bg-muted/30 flex-1 py-8">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <h1 className="mb-2 text-2xl font-bold sm:text-3xl">{t("pageTitle")}</h1>
          <p className="text-muted-foreground mb-6">
            {t("pageSubtitle")}
          </p>
          <CartView />
        </div>
      </main>
      <Footer />
    </div>
  )
}
