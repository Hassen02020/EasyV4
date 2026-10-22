/**
 * Page Network — /network
 * Server Component : liste les produits Network publiés (status = active,
 * supplierNodeId non null). NETWORK-B2C-01.
 */

import { Link } from "@/i18n/navigation"
import Image from "next/image"
import { getTranslations, getLocale } from "next-intl/server"
import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CatalogPagination } from "@/components/catalog-pagination"
import { withSystemContext } from "@/lib/db/tenant-context"
import { products, supplierNodes } from "@/lib/db/schema"
import { and, eq, isNotNull, ilike, or, sql, inArray } from "drizzle-orm"
import { Input } from "@/components/ui/input"
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"
import { getMarginsForAgency } from "@/lib/pro/server-context"
import { applyMargin } from "@/lib/pro/pricing"
import { buildLanguageAlternates } from "@/lib/seo/alternate-languages"
import { paginateOffset } from "@/lib/admin/pagination"
import { getCoverMediaForProducts } from "@/lib/media/query"
import { Package2, MapPin, ChevronRight } from "lucide-react"
import { ModuleHero } from "@/components/module-hero"
import { getIntlLocale } from "@/lib/i18n-date"

export const dynamic = "force-dynamic"

const PAGE_SIZE = 12

export const metadata = {
  title: "Produits Network | Easy2Book",
  description:
    "Découvrez nos produits et services Network réservables en ligne.",
  alternates: { languages: buildLanguageAlternates("/network") },
}

type NetworkProduct = typeof products.$inferSelect & {
  salePriceTnd: number | null
  coverMediaUrl: string | null
}

interface NetworkPageResult {
  items: NetworkProduct[]
  totalCount: number
  currentPage: number
  totalPages: number
}

const EMPTY_RESULT: NetworkPageResult = {
  items: [],
  totalCount: 0,
  currentPage: 1,
  totalPages: 1,
}

async function getNetworkProducts(
  q: string | undefined,
  page: number,
): Promise<NetworkPageResult> {
  try {
    const agencyId = await getDefaultAgencyId()
    if (!agencyId) return EMPTY_RESULT

    const margins = await getMarginsForAgency(agencyId, "", "direct")
    const networkMarginRule = margins.network

    return await withSystemContext(async (db) => {
      // NETWORK-ADMISSIBILITY-GAP-01 — un produit Network n'est admissible à
      // l'affichage public QUE si son partenaire (supplier_nodes) est
      // réellement actif, même définition que celle déjà canonique côté
      // écriture (network_product_node_is_active(), migration 0083, appelée
      // par lib/network/guest-booking-actions.ts avant toute réservation) —
      // jamais une nouvelle règle d'admissibilité inventée pour l'affichage.
      const activeNodeRows = await db
        .select({ id: supplierNodes.id })
        .from(supplierNodes)
        .where(eq(supplierNodes.onboardingStatus, "active"))
      const activeNodeIds = activeNodeRows.map((n) => n.id)
      if (activeNodeIds.length === 0) return EMPTY_RESULT

      const trimmedQ = q?.trim()
      const conditions = [
        eq(products.agencyId, agencyId),
        eq(products.status, "active"),
        isNotNull(products.supplierNodeId),
        isNotNull(products.costPrice),
        inArray(products.supplierNodeId, activeNodeIds),
        trimmedQ
          ? or(
              ilike(products.name, `%${trimmedQ}%`),
              ilike(products.destination, `%${trimmedQ}%`),
            )
          : undefined,
      ]

      const { data: rows, meta } = await paginateOffset<
        typeof products.$inferSelect
      >({
        query: db
          .select()
          .from(products)
          .where(and(...conditions)),
        page,
        limit: PAGE_SIZE,
        orderBy: sql`${products.name} ASC`,
        countQuery: async () => {
          const [{ count }] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(products)
            .where(and(...conditions))
          return count
        },
      })

      // NETWORK-MEDIA-01 — même mécanisme que Omra/Packages (mission §23/§24),
      // réutilisé tel quel pour ce module (zéro nouveau code de résolution).
      const coverByProduct = await getCoverMediaForProducts(
        db,
        agencyId,
        "network",
        rows.map((p) => p.id),
      )

      return {
        items: rows.map((p) => ({
          ...p,
          salePriceTnd: p.costPrice
            ? applyMargin(Number(p.costPrice), networkMarginRule)
            : null,
          coverMediaUrl: coverByProduct.get(p.id)?.cardUrl ?? null,
        })),
        totalCount: meta.totalCount ?? 0,
        currentPage: meta.currentPage,
        totalPages: meta.totalPages ?? 1,
      }
    })
  } catch {
    return EMPTY_RESULT
  }
}

function buildNetworkHref(
  locale: string,
  q: string | undefined,
  page: number,
): string {
  const params = new URLSearchParams()
  if (q) params.set("q", q)
  if (page > 1) params.set("page", String(page))
  const qs = params.toString()
  return `/${locale}/network${qs ? `?${qs}` : ""}`
}

export default async function NetworkPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>
}) {
  const { q, page: pageParam } = await searchParams
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1)
  const { items, currentPage, totalPages } = await getNetworkProducts(q, page)
  const t = await getTranslations("Network")
  const tCommon = await getTranslations("Common")
  const locale = await getLocale()
  const intlLocale = getIntlLocale(locale)

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="bg-muted/30 flex-1">
        <ModuleHero
          Icon={Package2}
          gradient="from-sky-900 to-sky-700"
          imageUrl="/images/network-banner.svg"
          kicker={t("kicker")}
          title={t("heroTitle")}
          subtitle={t("heroSubtitle")}
        >
          <form
            className="mx-auto flex max-w-lg gap-2"
            action={`/${locale}/network`}
          >
            <Input
              type="text"
              name="q"
              defaultValue={q ?? ""}
              placeholder={t("searchPlaceholder")}
              className="text-foreground bg-white/95"
            />
            <Button type="submit" className="bg-sky-600 hover:bg-sky-500">
              {t("searchButton")}
            </Button>
          </form>
        </ModuleHero>

        <div className="mx-auto max-w-6xl px-4 py-8">
          {items.length === 0 ? (
            <div className="bg-card text-muted-foreground rounded-xl border p-10 text-center">
              <Package2 className="text-muted-foreground/40 mx-auto mb-3 h-8 w-8" />
              {q?.trim()
                ? t("noResultsForQuery", { query: q })
                : t("emptyState")}
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((p) => (
                <Link
                  key={p.id}
                  href={`/network/${p.id}`}
                  className="group bg-card overflow-hidden rounded-xl border transition-shadow hover:shadow-lg"
                >
                  <div className="bg-muted relative h-32 w-full">
                    {p.coverMediaUrl ? (
                      <Image
                        src={p.coverMediaUrl}
                        alt={p.name}
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, 33vw"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-gradient-to-br from-sky-800 to-sky-600">
                        <Package2 className="h-10 w-10 text-white/30" />
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    {p.destination && (
                      <Badge variant="outline" className="mb-2 gap-1 text-xs">
                        <MapPin className="h-3 w-3" />
                        {p.destination}
                      </Badge>
                    )}
                    <h3 className="mb-1 font-semibold group-hover:text-sky-700">
                      {p.name}
                    </h3>
                    {p.shortDescription && (
                      <p className="text-muted-foreground mb-2 line-clamp-2 text-sm">
                        {p.shortDescription}
                      </p>
                    )}
                    {p.salePriceTnd != null && (
                      <div className="mb-3">
                        <p className="text-muted-foreground text-xs">
                          {t("startingFrom")}
                        </p>
                        <p className="text-2xl font-bold text-sky-700">
                          {p.salePriceTnd.toLocaleString(intlLocale)}
                          <span className="ml-1 text-sm font-normal">
                            {t("perUnit")}
                          </span>
                        </p>
                      </div>
                    )}
                    <Button
                      className="w-full gap-2 bg-sky-700 hover:bg-sky-800"
                      tabIndex={-1}
                    >
                      {t("viewDetails")}
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </Link>
              ))}
            </div>
          )}
          <CatalogPagination
            currentPage={currentPage}
            totalPages={totalPages}
            buildHref={(p) => buildNetworkHref(locale, q, p)}
            labels={{
              previous: tCommon("paginationPrevious"),
              next: tCommon("paginationNext"),
              previousAria: tCommon("paginationPreviousAria"),
              nextAria: tCommon("paginationNextAria"),
              goToPage: (p) => tCommon("paginationGoToPage", { page: p }),
            }}
          />
        </div>
      </main>
      <Footer />
    </div>
  )
}
