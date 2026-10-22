/**
 * Réservation d'un produit Network — /network/[id]/book
 * NETWORK-B2C-01.
 */

import { Link } from "@/i18n/navigation"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { and, eq, isNotNull, inArray } from "drizzle-orm"
import { ArrowLeft } from "lucide-react"
import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { withSystemContext } from "@/lib/db/tenant-context"
import { products, supplierNodes } from "@/lib/db/schema"
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"
import { getMarginsForAgency } from "@/lib/pro/server-context"
import { applyMargin } from "@/lib/pro/pricing"
import { NetworkGuestBookingForm } from "@/components/network/network-guest-booking-form"

async function getBookableProduct(id: string) {
  const agencyId = await getDefaultAgencyId()
  if (!agencyId) return null
  const margins = await getMarginsForAgency(agencyId, "", "direct")
  return withSystemContext(async (db) => {
    // NETWORK-ADMISSIBILITY-GAP-01 — même définition d'admissibilité que
    // network_product_node_is_active() (migration 0083), déjà canonique
    // côté écriture (lib/network/guest-booking-actions.ts) : cette page
    // n'affiche qu'un pré-remplissage, la création réelle de réservation
    // revérifie indépendamment, mais il ne faut pas proposer un formulaire
    // pour une offre qui échouerait de toute façon à la soumission.
    const activeNodeRows = await db
      .select({ id: supplierNodes.id })
      .from(supplierNodes)
      .where(eq(supplierNodes.onboardingStatus, "active"))
    const activeNodeIds = activeNodeRows.map((n) => n.id)
    if (activeNodeIds.length === 0) return null

    const [product] = await db
      .select()
      .from(products)
      .where(
        and(
          eq(products.id, id),
          eq(products.agencyId, agencyId),
          eq(products.status, "active"),
          isNotNull(products.supplierNodeId),
          isNotNull(products.costPrice),
          inArray(products.supplierNodeId, activeNodeIds),
        ),
      )
      .limit(1)
    if (!product) return null
    const salePriceTnd = applyMargin(Number(product.costPrice), margins.network)
    return { product, salePriceTnd }
  })
}

export default async function NetworkBookPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}) {
  const { id } = await params
  const data = await getBookableProduct(id)
  if (!data) notFound()

  const { product, salePriceTnd } = data
  const t = await getTranslations("Network")

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="bg-muted/30 flex-1">
        <div className="mx-auto max-w-3xl px-4 py-8">
          <Link
            href={`/network/${product.id}`}
            className="text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1 text-sm"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("backToProduct")}
          </Link>

          <h1 className="mb-2 text-2xl font-bold">{product.name}</h1>
          <p className="text-muted-foreground mb-6 text-sm">
            {t("bookingFormSubtitle")}
          </p>

          <NetworkGuestBookingForm
            product={{
              id: product.id,
              name: product.name,
              shortDescription: product.shortDescription,
              destination: product.destination,
              stock: product.stock,
            }}
            salePriceTnd={salePriceTnd}
          />
        </div>
      </main>
      <Footer />
    </div>
  )
}
