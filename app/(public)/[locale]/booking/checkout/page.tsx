import { Link, redirect } from "@/i18n/navigation"
import { getLocale, getTranslations } from "next-intl/server"
import { ChevronLeft } from "lucide-react"
import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { decodeDraft } from "@/lib/booking/draft-store"
import { computePriceBreakdown, formatMoney } from "@/lib/booking/pricing"
import { resolveDraftHotelPrice } from "@/lib/booking/price-token"
import { BookingSteps } from "@/components/booking/booking-steps"
import dynamicImport from "next/dynamic"
import { Suspense } from "react"
import { getIntlLocale } from "@/lib/i18n-date"

export const dynamic = 'force-dynamic'

const CheckoutForm = dynamicImport(() =>
  import("@/components/booking/checkout-form").then((m) => m.CheckoutForm),
)

type SP = { [k: string]: string | string[] | undefined }

async function CheckoutContent({
  searchParams,
}: {
  searchParams: SP
}) {
  const token = typeof searchParams.d === "string" ? searchParams.d : undefined
  const payload = decodeDraft(token)
  const locale = await getLocale()
  const t = await getTranslations("Booking")
  const tc = await getTranslations("Common")

  if (!payload || !payload.traveler) {
    redirect({ href: "/", locale })
    return null
  }

  const { draft, traveler } = payload

  const MODULE_LABEL: Record<string, string> = {
    hotel: t("moduleLabelHotel"),
    flight: t("moduleLabelFlight"),
    package: t("moduleLabelPackage"),
    omra: t("moduleLabelOmra"),
    transfer: t("moduleLabelTransfer"),
    activity: t("moduleLabelActivity"),
  }

  // Certification E2E — le brouillon (`?d=`) est un base64url NON SIGNÉ,
  // entièrement modifiable côté client (voir lib/booking/price-token.ts en
  // tête de fichier pour la preuve live du bug : un draft trafiqué affichait
  // avant un total falsifié ici, alors que la charge réelle — déjà correcte,
  // voir lib/booking/guest-actions.ts/actions.ts — se basait sur le vrai prix
  // fournisseur). Pour un module hôtel, le serveur revérifie le `priceToken`
  // signé au moment de la recherche AVANT tout affichage financier : jamais
  // de repli silencieux sur `draft.unitPriceTnd` seul si la vérification
  // échoue (token absent/expiré/signature invalide/offre différente) — on
  // bloque l'écran plutôt que d'afficher (et risquer de faire payer) un
  // montant non garanti.
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

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="bg-muted/30 flex-1 py-8">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <Link
            href={`/booking/travelers?d=${encodeURIComponent(token ?? "")}`}
            className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center text-sm"
          >
            <ChevronLeft className="size-4" />
            {t("editTravelers")}
          </Link>
          <h1 className="mb-2 text-2xl font-bold sm:text-3xl">
            {t("checkoutTitle")}
          </h1>
          <p className="text-muted-foreground mb-6">
            {t("checkoutSubtitle")}
          </p>
          <BookingSteps current={3} />

          <div className="mt-8 grid gap-6 lg:grid-cols-3">
            <div className="min-w-0 space-y-6 lg:col-span-2">
              <Card>
                <CardContent className="space-y-3 p-6">
                  <Badge variant="secondary">
                    {MODULE_LABEL[draft.module] ?? draft.module}
                  </Badge>
                  <h2 className="text-lg font-semibold break-words">{draft.offerLabel}</h2>
                  <Separator />
                  <dl className="text-muted-foreground grid gap-2 text-sm sm:grid-cols-2">
                    <Row k={t("departureLabel")} v={formatDate(draft.startDate, locale)} />
                    {draft.endDate ? (
                      <Row k={t("returnLabel")} v={formatDate(draft.endDate, locale)} />
                    ) : null}
                    <Row
                      k={tc("voyageurs")}
                      v={`${t("adultsCount", { n: draft.adults })}${
                        draft.children
                          ? ` + ${t("childrenCount", { n: draft.children })}`
                          : ""
                      }`}
                    />
                    <Row k={t("currencyLabel")} v={draft.currency} />
                  </dl>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="space-y-3 p-6">
                  <h3 className="text-sm font-semibold tracking-wide uppercase">
                    {t("mainTravelerTitle")}
                  </h3>
                  <Separator />
                  <dl className="text-muted-foreground grid gap-2 text-sm sm:grid-cols-2">
                    <Row
                      k={t("nameLabel")}
                      v={`${traveler.civility} ${traveler.firstName} ${traveler.lastName}`}
                    />
                    <Row k={t("emailLabel")} v={traveler.email} />
                    <Row k={t("phoneLabel")} v={traveler.phone} />
                    <Row
                      k={traveler.civicIdType === "cin" ? t("cinLabel") : t("passportLabel")}
                      v={traveler.civicId}
                    />
                  </dl>
                </CardContent>
              </Card>

              <Suspense fallback={<div>{t("loadingForm")}</div>}>
                <CheckoutForm token={token!} />
              </Suspense>
            </div>

            <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
              <Card>
                <CardContent className="space-y-3 p-5">
                  <h3 className="text-sm font-semibold tracking-wide uppercase">
                    {t("totalToPay")}
                  </h3>
                  <Row2 k={t("subtotal")} v={formatMoney(breakdown.subtotalTnd)} />
                  <Row2 k={t("vat")} v={formatMoney(breakdown.vatTnd)} />
                  {breakdown.serviceFeeTnd > 0 ? (
                    <Row2
                      k={t("serviceFee")}
                      v={formatMoney(breakdown.serviceFeeTnd)}
                    />
                  ) : null}
                  <Separator />
                  <div className="flex items-center justify-between text-base font-semibold">
                    <span>{t("totalIncl")}</span>
                    <span>{formatMoney(breakdown.totalTnd)}</span>
                  </div>
                  <div className="text-muted-foreground flex items-center justify-between text-sm">
                    <span>{t("depositToPay")}</span>
                    <span>{formatMoney(breakdown.depositTnd)}</span>
                  </div>
                  <div className="text-muted-foreground flex items-center justify-between text-sm">
                    <span>{t("balanceDue")}</span>
                    <span>{formatMoney(breakdown.balanceTnd)}</span>
                  </div>
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

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<SP>
}) {
  const t = await getTranslations("Booking")
  return (
    <Suspense fallback={<div>{t("loadingGeneric")}</div>}>
      <CheckoutContent searchParams={await searchParams} />
    </Suspense>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-foreground font-medium">{v}</span>
    </div>
  )
}
function Row2({ k, v }: { k: string; v: string }) {
  return (
    <div className="text-muted-foreground flex items-center justify-between text-sm">
      <span>{k}</span>
      <span className="text-foreground">{v}</span>
    </div>
  )
}
function formatDate(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleDateString(getIntlLocale(locale), {
      day: "2-digit",
      month: "long",
      year: "numeric",
    })
  } catch {
    return iso
  }
}
