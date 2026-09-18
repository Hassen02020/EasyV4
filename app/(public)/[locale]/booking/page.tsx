import { Link, redirect } from "@/i18n/navigation"
import { getLocale, getTranslations } from "next-intl/server"
import {
  ArrowRight,
  CalendarDays,
  Users,
  Tag,
  Check,
  ChevronLeft,
} from "lucide-react"
import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { decodeDraft, encodeDraft } from "@/lib/booking/draft-store"
import { computePriceBreakdown, formatMoney } from "@/lib/booking/pricing"
import { resolveDraftHotelPrice } from "@/lib/booking/price-token"
import { BookingSteps } from "@/components/booking/booking-steps"
import { getIntlLocale } from "@/lib/i18n-date"

export const dynamic = 'force-dynamic'

type SP = { [k: string]: string | string[] | undefined }

export default async function BookingStep1Page({
  searchParams,
}: {
  searchParams: Promise<SP>
}) {
  const sp = await searchParams
  const token = typeof sp.d === "string" ? sp.d : undefined
  const locale = await getLocale()
  const t = await getTranslations("Booking")
  const tc = await getTranslations("Common")

  const MODULE_LABEL: Record<string, string> = {
    hotel: t("moduleLabelHotel"),
    flight: t("moduleLabelFlight"),
    package: t("moduleLabelPackage"),
    omra: t("moduleLabelOmra"),
    transfer: t("moduleLabelTransfer"),
    activity: t("moduleLabelActivity"),
  }

  // Si pas de draft, on accepte les paramètres bruts pour bootstrap depuis un lien
  let token2 = token
  if (!token2) {
    const built = bootstrapDraftFromParams(sp)
    if (built) token2 = built
  }

  const payload = decodeDraft(token2)
  if (!payload) {
    redirect({ href: "/", locale })
    return null
  }

  const { draft } = payload

  // Certification E2E — même garde qu'à l'étape checkout (voir
  // app/booking/checkout/page.tsx et lib/booking/price-token.ts) : pour un
  // module hôtel, jamais `draft.unitPriceTnd` seul si le `priceToken` signé
  // ne se revérifie pas — on bloque l'affichage plutôt que de montrer un
  // montant non garanti dès cette première étape.
  const resolvedPrice = resolveDraftHotelPrice(draft)
  if (draft.module === "hotel" && !resolvedPrice.verified) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="bg-muted/30 flex-1 py-8">
          <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6 lg:px-8">
            <h1 className="mb-2 text-2xl font-bold">
              {t("priceNotVerifiedTitle")}
            </h1>
            <p className="text-muted-foreground mb-6">
              {t("priceNotVerifiedDesc")}
            </p>
            <Link
              href="/hotels/search"
              className="text-foreground inline-flex items-center gap-1 underline"
            >
              <ChevronLeft className="size-4" />
              {t("relaunchHotelSearch")}
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    )
  }

  const breakdown = computePriceBreakdown({
    unitPriceTnd: resolvedPrice.unitPriceTnd,
    adults: draft.adults,
    children: draft.children,
    unitChildPriceTnd: draft.unitChildPriceTnd,
  })

  const nights = draft.endDate
    ? Math.max(
        1,
        Math.round(
          (new Date(draft.endDate).getTime() -
            new Date(draft.startDate).getTime()) /
            (1000 * 60 * 60 * 24),
        ),
      )
    : 1

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="bg-muted/30 flex-1 py-8">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center text-sm"
          >
            <ChevronLeft className="size-4" />
            {t("back")}
          </Link>
          <h1 className="mb-2 text-2xl font-bold sm:text-3xl">
            {t("confirmOfferTitle")}
          </h1>
          <p className="text-muted-foreground mb-6">
            {t("confirmOfferSubtitle")}
          </p>

          <BookingSteps current={1} />

          <div className="mt-8 grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Card>
                <CardContent className="space-y-4 p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Badge variant="secondary" className="mb-2">
                        {MODULE_LABEL[draft.module] ?? draft.module}
                      </Badge>
                      <h2 className="text-xl font-semibold">
                        {draft.offerLabel}
                      </h2>
                    </div>
                    <Badge className="bg-emerald-500 hover:bg-emerald-500">
                      {t("availableBadge")}
                    </Badge>
                  </div>
                  <Separator />
                  <dl className="grid gap-3 sm:grid-cols-2">
                    <div className="flex items-center gap-2 text-sm">
                      <CalendarDays className="text-muted-foreground size-4" />
                      <span className="text-muted-foreground">{t("fromLabel")}</span>
                      <span className="font-medium">
                        {formatDate(draft.startDate, locale)}
                      </span>
                    </div>
                    {draft.endDate ? (
                      <div className="flex items-center gap-2 text-sm">
                        <CalendarDays className="text-muted-foreground size-4" />
                        <span className="text-muted-foreground">{t("toLabel")}</span>
                        <span className="font-medium">
                          {formatDate(draft.endDate, locale)}
                        </span>
                      </div>
                    ) : null}
                    <div className="flex items-center gap-2 text-sm">
                      <Users className="text-muted-foreground size-4" />
                      <span className="text-muted-foreground">{tc("voyageurs")}</span>
                      <span className="font-medium">
                        {t("adultsCount", { n: draft.adults })}
                        {draft.children
                          ? ` + ${t("childrenCount", { n: draft.children })}`
                          : ""}
                      </span>
                    </div>
                    {draft.module === "hotel" ? (
                      <div className="flex items-center gap-2 text-sm">
                        <Tag className="text-muted-foreground size-4" />
                        <span className="text-muted-foreground">{t("durationLabel")}</span>
                        <span className="font-medium">
                          {t("nightsCount", { n: nights })}
                        </span>
                      </div>
                    ) : null}
                  </dl>
                  <Separator />
                  <ul className="text-muted-foreground grid gap-2 text-sm sm:grid-cols-2">
                    <li className="flex items-center gap-2">
                      <Check className="size-4 text-emerald-600" />
                      {t("freeCancellation48h")}
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="size-4 text-emerald-600" />
                      {t("immediateConfirmation")}
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="size-4 text-emerald-600" />
                      {t("supportNotice")}
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="size-4 text-emerald-600" />
                      {t("securePayment")}
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>

            <aside className="space-y-4">
              <Card>
                <CardContent className="space-y-3 p-5">
                  <h3 className="text-sm font-semibold tracking-wide uppercase">
                    {t("priceSummaryTitle")}
                  </h3>
                  <PriceLine
                    label={t("subtotal")}
                    amount={breakdown.subtotalTnd}
                  />
                  <PriceLine label={t("vat")} amount={breakdown.vatTnd} />
                  {breakdown.serviceFeeTnd > 0 ? (
                    <PriceLine
                      label={t("serviceFee")}
                      amount={breakdown.serviceFeeTnd}
                    />
                  ) : null}
                  <Separator />
                  <div className="flex items-center justify-between text-base font-semibold">
                    <span>{t("totalIncl")}</span>
                    <span>{formatMoney(breakdown.totalTnd)}</span>
                  </div>
                  <div className="text-muted-foreground flex items-center justify-between text-sm">
                    <span>{t("depositPercent")}</span>
                    <span>{formatMoney(breakdown.depositTnd)}</span>
                  </div>
                  <Button asChild className="w-full" size="lg">
                    <Link
                      href={`/booking/travelers?d=${encodeURIComponent(token2 ?? "")}`}
                    >
                      {t("continueButton")}
                      <ArrowRight className="ml-2 size-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </aside>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}

function PriceLine({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="text-muted-foreground flex items-center justify-between text-sm">
      <span>{label}</span>
      <span className="text-foreground">{formatMoney(amount)}</span>
    </div>
  )
}

function formatDate(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleDateString(getIntlLocale(locale), {
      weekday: "short",
      day: "2-digit",
      month: "long",
      year: "numeric",
    })
  } catch {
    return iso
  }
}

function bootstrapDraftFromParams(sp: SP): string | null {
  const mod = first(sp.module)
  const offerId = first(sp.offerId)
  const offerLabel = first(sp.offerLabel)
  const startDate = first(sp.startDate)
  const unitPriceTnd = Number(first(sp.unitPriceTnd))
  const adults = Number(first(sp.adults) ?? "2")
  if (!mod || !offerId || !offerLabel || !startDate) return null
  if (!Number.isFinite(unitPriceTnd)) return null
  return encodeDraft({
    draft: {
      module: mod as
        | "hotel"
        | "flight"
        | "package"
        | "omra"
        | "transfer"
        | "activity",
      offerId,
      offerLabel,
      startDate,
      endDate: first(sp.endDate),
      adults,
      children: Number(first(sp.children) ?? "0"),
      unitPriceTnd,
      currency: (first(sp.currency) as "TND" | "EUR" | "USD") ?? "TND",
    },
  })
}

function first(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0]
  return v
}
