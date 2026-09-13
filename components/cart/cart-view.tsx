"use client"

/**
 * Panier multi-produits B2C — vue + checkout séquentiel.
 *
 * Chaque ligne appelle DIRECTEMENT le guest checkout déjà réel de son
 * module (createGuestReservationFromDraft/createGuestPackageBooking/
 * createGuestActivityBooking) — jamais un moteur de paiement/panier
 * groupé inventé. Le prix/dispo affichés ici sont une ESTIMATION (snapshot
 * pris au moment de l'ajout) ; le montant réellement réservé est toujours
 * recalculé et re-vérifié par l'action serveur de chaque module au moment
 * de la confirmation, exactement comme un achat individuel — jamais fait
 * confiance au panier pour le prix final.
 *
 * Traitement séquentiel (pas Promise.all) : si une ligne échoue (place
 * vendue entre-temps, session expirée...), les autres continuent quand
 * même — jamais un tout-ou-rien qui bloquerait un hôtel disponible à cause
 * d'une activité complète.
 */

import { useState } from "react"
import { Link } from "@/i18n/navigation"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import {
  Loader2,
  ShoppingCart,
  Trash2,
  BedDouble,
  MapPin,
  Ticket,
  CheckCircle2,
  AlertCircle,
  Banknote,
  Wallet,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { useCart } from "@/lib/cart/use-cart"
import type { CartLine, CartCheckoutMethod } from "@/lib/cart/cart-types"
import { createGuestReservationFromDraft } from "@/lib/booking/guest-actions"
import { createGuestPackageBooking } from "@/lib/packages/booking-actions"
import { createGuestActivityBooking } from "@/lib/activities/guest-booking-actions"
import { computeIdempotencyKey } from "@/lib/cart/idempotency"

const MODULE_ICON = { hotel: BedDouble, package: MapPin, activity: Ticket } as const

interface ConfirmedBooking {
  lineId: string
  title: string
  publicRef: string
  guestAccessToken: string
}

export function CartView() {
  const t = useTranslations("Panier")
  const cart = useCart()
  const [acceptCgv, setAcceptCgv] = useState(false)
  const [method, setMethod] = useState<CartCheckoutMethod>("transfer")
  const [processing, setProcessing] = useState(false)
  const [lineErrors, setLineErrors] = useState<Record<string, string>>({})
  const [confirmed, setConfirmed] = useState<ConfirmedBooking[]>([])

  const MODULE_LABEL = {
    hotel: t("moduleLabelHotel"),
    package: t("moduleLabelPackage"),
    activity: t("moduleLabelActivity"),
  } as const

  const METHODS: { key: CartCheckoutMethod; label: string; desc: string; icon: typeof Banknote }[] = [
    {
      key: "transfer",
      label: t("methodTransferLabel"),
      desc: t("methodTransferDesc"),
      icon: Banknote,
    },
    {
      key: "cash",
      label: t("methodCashLabel"),
      desc: t("methodCashDesc"),
      icon: Wallet,
    },
  ]

  function lineDetail(line: CartLine): string {
    if (line.module === "hotel") {
      const dates = `${line.draft.startDate}${line.draft.endDate ? ` → ${line.draft.endDate}` : ""}`
      return `${dates} · ${t("adultsCount", { n: line.draft.adults })}`
    }
    if (line.module === "package") {
      return `${t("adultsCount", { n: line.booking.adults })}${line.booking.children ? ` · ${t("childrenCount", { n: line.booking.children })}` : ""}`
    }
    return `${t("adultsCount", { n: line.booking.adults })}${line.booking.children ? ` · ${t("childrenCount", { n: line.booking.children })}` : ""}`
  }

  const total = cart.lines.reduce((sum, l) => sum + l.priceTnd, 0)

  async function handleCheckout() {
    if (cart.lines.length === 0 || !acceptCgv || processing) return
    setProcessing(true)
    setLineErrors({})
    const newlyConfirmed: ConfirmedBooking[] = []
    const errors: Record<string, string> = {}

    for (const line of cart.lines) {
      try {
        if (line.module === "hotel") {
          const idempotencyKey = await computeIdempotencyKey(
            JSON.stringify({ draft: line.draft, traveler: line.traveler, method }),
          )
          const result = await createGuestReservationFromDraft({
            draft: line.draft,
            traveler: line.traveler,
            paymentMethod: method,
            idempotencyKey,
          })
          if (result.ok) {
            newlyConfirmed.push({ lineId: line.id, title: line.title, publicRef: result.publicRef, guestAccessToken: result.guestAccessToken })
            cart.remove(line.id)
          } else {
            errors[line.id] = result.error
          }
        } else if (line.module === "package") {
          const result = await createGuestPackageBooking({ booking: line.booking, paymentMethod: method })
          if (result.ok) {
            newlyConfirmed.push({ lineId: line.id, title: line.title, publicRef: result.publicRef, guestAccessToken: result.guestAccessToken })
            cart.remove(line.id)
          } else {
            errors[line.id] = result.error
          }
        } else {
          const result = await createGuestActivityBooking({ booking: line.booking, paymentMethod: method })
          if (result.ok) {
            newlyConfirmed.push({ lineId: line.id, title: line.title, publicRef: result.publicRef, guestAccessToken: result.guestAccessToken })
            cart.remove(line.id)
          } else {
            errors[line.id] = result.error
          }
        }
      } catch (err) {
        errors[line.id] = err instanceof Error ? err.message : t("genericError")
      }
    }

    setConfirmed((prev) => [...prev, ...newlyConfirmed])
    setLineErrors(errors)
    setProcessing(false)

    if (newlyConfirmed.length > 0 && Object.keys(errors).length === 0) {
      toast.success(t("successToast", { n: newlyConfirmed.length }))
    } else if (newlyConfirmed.length > 0) {
      toast.warning(t("partialErrorToast"))
    } else {
      toast.error(t("allFailedToast"))
    }
  }

  if (cart.lines.length === 0 && confirmed.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <ShoppingCart className="text-muted-foreground size-10" />
          <p className="text-muted-foreground">{t("emptyCartMessage")}</p>
          <Button asChild variant="outline">
            <Link href="/">{t("exploreOffers")}</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {confirmed.length > 0 ? (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="space-y-2 py-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
              <CheckCircle2 className="size-4" />
              {t("confirmedReservationsTitle")}
            </p>
            <ul className="space-y-1">
              {confirmed.map((c) => (
                <li key={c.lineId} className="text-sm">
                  <span className="font-medium">{c.title}</span> —{" "}
                  <Link
                    href={`/booking/confirmation/${c.publicRef}?token=${c.guestAccessToken}`}
                    className="text-primary underline"
                  >
                    {t("viewConfirmation", { ref: c.publicRef })}
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {cart.lines.length > 0 ? (
        <>
          <div className="space-y-3">
            {cart.lines.map((line) => {
              const Icon = MODULE_ICON[line.module]
              const error = lineErrors[line.id]
              return (
                <Card key={line.id} className={error ? "border-destructive" : undefined}>
                  <CardContent className="flex items-start justify-between gap-3 py-4">
                    <div className="flex items-start gap-3">
                      <span className="bg-sidebar/10 text-sidebar mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-md">
                        <Icon className="size-4" />
                      </span>
                      <div>
                        <p className="text-xs font-medium tracking-wide uppercase text-muted-foreground">
                          {MODULE_LABEL[line.module]}
                        </p>
                        <p className="font-semibold">{line.title}</p>
                        <p className="text-muted-foreground text-sm">{lineDetail(line)}</p>
                        {error ? (
                          <p className="text-destructive mt-1 flex items-center gap-1 text-xs">
                            <AlertCircle className="size-3.5" />
                            {error}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className="font-bold">{line.priceTnd.toFixed(3)} DT</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => cart.remove(line.id)}
                        disabled={processing}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          <Card className="bg-sidebar/5">
            <CardContent className="space-y-4 py-4">
              <div className="flex items-center justify-between text-lg">
                <span className="font-semibold">{t("totalEstimated")}</span>
                <span className="font-bold text-sidebar">{total.toFixed(3)} DT</span>
              </div>
              <p className="text-muted-foreground text-xs">
                {t("estimateNotice")}
              </p>

              <Separator />

              <div>
                <h3 className="mb-3 text-sm font-semibold tracking-wide uppercase">{t("paymentMethodTitle")}</h3>
                <div className="grid gap-3">
                  {METHODS.map((m) => {
                    const active = method === m.key
                    const Icon = m.icon
                    return (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => setMethod(m.key)}
                        className={
                          "flex items-start gap-3 rounded-lg border p-4 text-left transition-all " +
                          (active ? "border-sidebar bg-sidebar/5 shadow-sm" : "border-border hover:border-foreground/30")
                        }
                      >
                        <span
                          className={
                            "mt-0.5 inline-flex size-9 items-center justify-center rounded-md " +
                            (active ? "bg-sidebar text-white" : "bg-muted text-muted-foreground")
                          }
                        >
                          <Icon className="size-5" />
                        </span>
                        <span className="flex-1">
                          <span className="block text-sm font-semibold">{m.label}</span>
                          <span className="text-muted-foreground text-xs">{m.desc}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="flex items-start gap-2 pt-1">
                <Checkbox id="cgv-cart" checked={acceptCgv} onCheckedChange={(v) => setAcceptCgv(Boolean(v))} />
                <Label htmlFor="cgv-cart" className="text-muted-foreground text-sm leading-snug">
                  {t.rich("acceptCgvLabel", {
                    cgvLink: (chunks) => (
                      <Link href="/cgv" target="_blank" className="text-foreground underline">
                        {chunks}
                      </Link>
                    ),
                  })}
                </Label>
              </div>

              <Button
                type="button"
                size="lg"
                className="w-full"
                disabled={!acceptCgv || processing}
                onClick={handleCheckout}
              >
                {processing ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    {t("processingLabel")}
                  </>
                ) : (
                  t("confirmCartButton", { count: cart.lines.length })
                )}
              </Button>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}
