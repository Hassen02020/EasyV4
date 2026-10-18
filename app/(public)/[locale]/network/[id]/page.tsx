/**
 * Détail d'un produit Network — /network/[id]
 * NETWORK-B2C-01.
 */

import { Link } from "@/i18n/navigation"
import { notFound } from "next/navigation"
import { getTranslations, getLocale } from "next-intl/server"
import { getIntlLocale } from "@/lib/i18n-date"
import { and, eq, isNotNull } from "drizzle-orm"
import { ArrowLeft, MapPin, Package2, ShieldCheck } from "lucide-react"
import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { withSystemContext } from "@/lib/db/tenant-context"
import { products } from "@/lib/db/schema"
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"
import { getMarginsForAgency } from "@/lib/pro/server-context"
import { applyMargin } from "@/lib/pro/pricing"
import { buildLanguageAlternates } from "@/lib/seo/alternate-languages"

export const dynamic = "force-dynamic"

async function getNetworkProduct(id: string) {
  try {
    const agencyId = await getDefaultAgencyId()
    if (!agencyId) return null
    const margins = await getMarginsForAgency(agencyId, "", "direct")
    return await withSystemContext(async (db) => {
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
          ),
        )
        .limit(1)
      if (!product) return null
      const salePriceTnd = applyMargin(
        Number(product.costPrice),
        margins.network,
      )
      return { product, salePriceTnd, agencyId }
    })
  } catch {
    return null
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}) {
  const { id } = await params
  const data = await getNetworkProduct(id)
  if (!data) return {}
  return {
    title: `${data.product.name} | Easy2Book`,
    description: data.product.shortDescription ?? undefined,
    alternates: {
      languages: buildLanguageAlternates(`/network/${id}`),
    },
  }
}

export default async function NetworkProductPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}) {
  const { id, locale } = await params
  const data = await getNetworkProduct(id)
  if (!data) notFound()

  const { product, salePriceTnd } = data
  const t = await getTranslations("Network")
  const intlLocale = getIntlLocale(locale)

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <div className="mx-auto max-w-4xl px-4 py-8">
          <Link
            href="/network"
            className="text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1 text-sm"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("backToListing")}
          </Link>

          <div className="grid gap-8 lg:grid-cols-3">
            {/* Main content */}
            <div className="lg:col-span-2">
              {/* Hero placeholder */}
              <div className="mb-6 flex h-48 items-center justify-center rounded-xl bg-gradient-to-br from-sky-800 to-sky-600">
                <Package2 className="h-16 w-16 text-white/30" />
              </div>

              <div className="mb-2 flex flex-wrap gap-2">
                {product.destination && (
                  <Badge variant="outline" className="gap-1">
                    <MapPin className="h-3 w-3" />
                    {product.destination}
                  </Badge>
                )}
                {product.country && (
                  <Badge variant="secondary">{product.country}</Badge>
                )}
                {product.city && (
                  <Badge variant="secondary">{product.city}</Badge>
                )}
              </div>

              <h1 className="mb-4 text-3xl font-bold">{product.name}</h1>

              {product.longDescription && (
                <div className="text-muted-foreground mb-6 leading-relaxed whitespace-pre-wrap">
                  {product.longDescription}
                </div>
              )}
              {!product.longDescription && product.shortDescription && (
                <p className="text-muted-foreground mb-6">
                  {product.shortDescription}
                </p>
              )}

              <div className="bg-muted/40 flex items-start gap-3 rounded-lg p-4">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" />
                <p className="text-sm">{t("bookingGuarantee")}</p>
              </div>
            </div>

            {/* Booking sidebar */}
            <div>
              <div className="bg-card sticky top-4 rounded-xl border p-6 shadow-sm">
                <p className="text-muted-foreground mb-1 text-xs">
                  {t("startingFrom")}
                </p>
                <p className="mb-4 text-3xl font-bold text-sky-700">
                  {salePriceTnd.toLocaleString(intlLocale)}
                  <span className="ml-1 text-base font-normal">
                    {t("perUnit")}
                  </span>
                </p>
                <Link href={`/network/${product.id}/book`}>
                  <Button className="w-full bg-sky-700 hover:bg-sky-800">
                    {t("reserveNow")}
                  </Button>
                </Link>
                <p className="text-muted-foreground mt-3 text-center text-xs">
                  {t("noCommitment")}
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
