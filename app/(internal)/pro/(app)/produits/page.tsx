/**
 * Produits autorisés — /pro/produits (Phase 13.1, gap #2).
 *
 * Premier point d'entrée B2B pour vendre Omraty / Voyages Organisés /
 * Attractions : liste ce que `product_authorizations` autorise
 * explicitement cette agence à voir (RLS élargie, 0023_commerce_completion.sql)
 * — jamais le catalogue complet d'une autre agence. Réservation via un
 * formulaire compact par ligne (contact simple + participants), qui
 * appelle directement `createOmraBooking`/`createPackageBooking`/
 * `createActivityBooking` (B2B, débit wallet, aucun nouveau moteur créé).
 */

import { redirect } from "next/navigation"
import { ShoppingBag } from "lucide-react"
import { ProPageShell } from "@/components/pro/pro-page-shell"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentPartnerProfile } from "@/lib/auth/partner-profile"
import { listAuthorizedProductsForAgency } from "@/lib/b2b/authorized-products"
import { AuthorizedProductsList } from "@/components/pro/authorized-products-list"

export const metadata = { title: "Produits autorisés | Espace Pro Easy2Book" }

export const dynamic = "force-dynamic"

export default async function ProProductsPage() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/pro/login")

  const profile = await getCurrentPartnerProfile(user.id)
  if (!profile) redirect("/pro/login")

  const products = await listAuthorizedProductsForAgency(profile.agency.id, user.id)

  return (
    <ProPageShell
      icon={ShoppingBag}
      title="Produits autorisés"
      description="Omraty, Voyages Organisés et Attractions que votre agence est autorisée à vendre."
    >
      {products.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Aucun produit autorisé pour le moment. Contactez Easy2Book pour être autorisé à
          revendre un produit Omraty, Voyage Organisé ou Attraction.
        </div>
      ) : (
        <AuthorizedProductsList products={products} />
      )}
    </ProPageShell>
  )
}
