/**
 * Panier multi-produits B2C — /panier
 *
 * Voir lib/cart/cart-types.ts pour la décision de portée (Hôtel/Package/
 * Activité seulement, localStorage, pas de compte requis).
 */

import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { CartView } from "@/components/cart/cart-view"

export const metadata = {
  title: "Mon panier | Easy2Book",
}

export default function CartPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="bg-muted/30 flex-1 py-8">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <h1 className="mb-2 text-2xl font-bold sm:text-3xl">Mon panier</h1>
          <p className="text-muted-foreground mb-6">
            Réservations en attente de confirmation — rien n&apos;est débité tant que vous
            n&apos;avez pas validé le panier.
          </p>
          <CartView />
        </div>
      </main>
      <Footer />
    </div>
  )
}
