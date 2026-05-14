import Link from "next/link"
import { redirect } from "next/navigation"
import {
  ArrowRight,
  CalendarDays,
  Users,
  Tag,
  Check,
  ChevronLeft,
} from "lucide-react"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { decodeDraft, encodeDraft } from "@/lib/booking/draft-store"
import { computePriceBreakdown, formatMoney } from "@/lib/booking/pricing"
import { BookingSteps } from "@/components/booking/booking-steps"

type SP = { [k: string]: string | string[] | undefined }

const MODULE_LABEL: Record<string, string> = {
  hotel: "Hôtel",
  flight: "Vol",
  package: "Voyage organisé",
  omra: "Omra",
  transfer: "Transfert",
  activity: "Activité",
}

export default async function BookingStep1Page({
  searchParams,
}: {
  searchParams: Promise<SP>
}) {
  const sp = await searchParams
  const token = typeof sp.d === "string" ? sp.d : undefined

  // Si pas de draft, on accepte les paramètres bruts pour bootstrap depuis un lien
  let token2 = token
  if (!token2) {
    const built = bootstrapDraftFromParams(sp)
    if (built) token2 = built
  }

  const payload = decodeDraft(token2)
  if (!payload) {
    redirect("/")
  }

  const { draft } = payload
  const breakdown = computePriceBreakdown({
    unitPriceTnd: draft.unitPriceTnd,
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
            Retour
          </Link>
          <h1 className="mb-2 text-2xl font-bold sm:text-3xl">
            Confirmer votre offre
          </h1>
          <p className="text-muted-foreground mb-6">
            Vérifiez les informations avant de continuer vers la saisie
            voyageurs.
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
                      Disponible
                    </Badge>
                  </div>
                  <Separator />
                  <dl className="grid gap-3 sm:grid-cols-2">
                    <div className="flex items-center gap-2 text-sm">
                      <CalendarDays className="text-muted-foreground size-4" />
                      <span className="text-muted-foreground">Du</span>
                      <span className="font-medium">
                        {formatDate(draft.startDate)}
                      </span>
                    </div>
                    {draft.endDate ? (
                      <div className="flex items-center gap-2 text-sm">
                        <CalendarDays className="text-muted-foreground size-4" />
                        <span className="text-muted-foreground">Au</span>
                        <span className="font-medium">
                          {formatDate(draft.endDate)}
                        </span>
                      </div>
                    ) : null}
                    <div className="flex items-center gap-2 text-sm">
                      <Users className="text-muted-foreground size-4" />
                      <span className="text-muted-foreground">Voyageurs</span>
                      <span className="font-medium">
                        {draft.adults} adulte{draft.adults > 1 ? "s" : ""}
                        {draft.children
                          ? ` + ${draft.children} enfant${draft.children > 1 ? "s" : ""}`
                          : ""}
                      </span>
                    </div>
                    {draft.module === "hotel" ? (
                      <div className="flex items-center gap-2 text-sm">
                        <Tag className="text-muted-foreground size-4" />
                        <span className="text-muted-foreground">Durée</span>
                        <span className="font-medium">
                          {nights} nuit{nights > 1 ? "s" : ""}
                        </span>
                      </div>
                    ) : null}
                  </dl>
                  <Separator />
                  <ul className="text-muted-foreground grid gap-2 text-sm sm:grid-cols-2">
                    <li className="flex items-center gap-2">
                      <Check className="size-4 text-emerald-600" />
                      Annulation gratuite jusqu&apos;à 48 h avant
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="size-4 text-emerald-600" />
                      Confirmation immédiate
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="size-4 text-emerald-600" />
                      Support TunisiaGo 7j/7
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="size-4 text-emerald-600" />
                      Paiement sécurisé
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>

            <aside className="space-y-4">
              <Card>
                <CardContent className="space-y-3 p-5">
                  <h3 className="text-sm font-semibold tracking-wide uppercase">
                    Récapitulatif prix
                  </h3>
                  <PriceLine
                    label="Sous-total"
                    amount={breakdown.subtotalTnd}
                  />
                  <PriceLine label="TVA 19%" amount={breakdown.vatTnd} />
                  {breakdown.serviceFeeTnd > 0 ? (
                    <PriceLine
                      label="Frais service"
                      amount={breakdown.serviceFeeTnd}
                    />
                  ) : null}
                  <Separator />
                  <div className="flex items-center justify-between text-base font-semibold">
                    <span>Total TTC</span>
                    <span>{formatMoney(breakdown.totalTnd)}</span>
                  </div>
                  <div className="text-muted-foreground flex items-center justify-between text-sm">
                    <span>Acompte 30 %</span>
                    <span>{formatMoney(breakdown.depositTnd)}</span>
                  </div>
                  <Button asChild className="w-full" size="lg">
                    <Link
                      href={`/booking/travelers?d=${encodeURIComponent(token2 ?? "")}`}
                    >
                      Continuer
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

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
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
