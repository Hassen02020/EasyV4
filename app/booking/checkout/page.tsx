import Link from "next/link"
import { redirect } from "next/navigation"
import { ChevronLeft } from "lucide-react"
import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { decodeDraft } from "@/lib/booking/draft-store"
import { computePriceBreakdown, formatMoney } from "@/lib/booking/pricing"
import { BookingSteps } from "@/components/booking/booking-steps"
import dynamic from "next/dynamic"

const CheckoutForm = dynamic(
  () => import("@/components/booking/checkout-form").then((m) => m.CheckoutForm),
)

type SP = { [k: string]: string | string[] | undefined }

const MODULE_LABEL: Record<string, string> = {
  hotel: "Hôtel",
  flight: "Vol",
  package: "Voyage organisé",
  omra: "Omra",
  transfer: "Transfert",
  activity: "Activité",
}

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<SP>
}) {
  const sp = await searchParams
  const token = typeof sp.d === "string" ? sp.d : undefined
  const payload = decodeDraft(token)
  if (!payload || !payload.traveler) redirect("/")

  const { draft, traveler } = payload
  const breakdown = computePriceBreakdown({
    unitPriceTnd: draft.unitPriceTnd,
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
            Modifier les voyageurs
          </Link>
          <h1 className="mb-2 text-2xl font-bold sm:text-3xl">
            Récapitulatif & paiement
          </h1>
          <p className="text-muted-foreground mb-6">
            Vérifiez votre commande puis confirmez le paiement (simulation
            sécurisée pour démonstration).
          </p>
          <BookingSteps current={3} />

          <div className="mt-8 grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <Card>
                <CardContent className="space-y-3 p-6">
                  <Badge variant="secondary">
                    {MODULE_LABEL[draft.module] ?? draft.module}
                  </Badge>
                  <h2 className="text-lg font-semibold">{draft.offerLabel}</h2>
                  <Separator />
                  <dl className="text-muted-foreground grid gap-2 text-sm sm:grid-cols-2">
                    <Row k="Départ" v={formatDate(draft.startDate)} />
                    {draft.endDate ? (
                      <Row k="Retour" v={formatDate(draft.endDate)} />
                    ) : null}
                    <Row
                      k="Voyageurs"
                      v={`${draft.adults} adulte${draft.adults > 1 ? "s" : ""}${
                        draft.children
                          ? ` + ${draft.children} enfant${draft.children > 1 ? "s" : ""}`
                          : ""
                      }`}
                    />
                    <Row k="Devise" v={draft.currency} />
                  </dl>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="space-y-3 p-6">
                  <h3 className="text-sm font-semibold tracking-wide uppercase">
                    Voyageur principal
                  </h3>
                  <Separator />
                  <dl className="text-muted-foreground grid gap-2 text-sm sm:grid-cols-2">
                    <Row
                      k="Nom"
                      v={`${traveler.civility} ${traveler.firstName} ${traveler.lastName}`}
                    />
                    <Row k="Email" v={traveler.email} />
                    <Row k="Téléphone" v={traveler.phone} />
                    <Row
                      k={traveler.civicIdType === "cin" ? "CIN" : "Passeport"}
                      v={traveler.civicId}
                    />
                  </dl>
                </CardContent>
              </Card>

              <CheckoutForm token={token!} />
            </div>

            <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
              <Card>
                <CardContent className="space-y-3 p-5">
                  <h3 className="text-sm font-semibold tracking-wide uppercase">
                    Total à payer
                  </h3>
                  <Row2 k="Sous-total" v={formatMoney(breakdown.subtotalTnd)} />
                  <Row2 k="TVA 19 %" v={formatMoney(breakdown.vatTnd)} />
                  {breakdown.serviceFeeTnd > 0 ? (
                    <Row2
                      k="Frais service"
                      v={formatMoney(breakdown.serviceFeeTnd)}
                    />
                  ) : null}
                  <Separator />
                  <div className="flex items-center justify-between text-base font-semibold">
                    <span>Total TTC</span>
                    <span>{formatMoney(breakdown.totalTnd)}</span>
                  </div>
                  <div className="text-muted-foreground flex items-center justify-between text-sm">
                    <span>Acompte à régler</span>
                    <span>{formatMoney(breakdown.depositTnd)}</span>
                  </div>
                  <div className="text-muted-foreground flex items-center justify-between text-sm">
                    <span>Solde à la prestation</span>
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
function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    })
  } catch {
    return iso
  }
}
