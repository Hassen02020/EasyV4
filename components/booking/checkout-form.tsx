"use client"

import { useState, useTransition } from "react"
import { Link, useRouter } from "@/i18n/navigation"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { ShieldCheck, CreditCard, Banknote, Wallet, Building2, ShoppingCart } from "lucide-react"
import { submitCheckoutAction } from "@/lib/booking/actions"
import { resolveDraftPriceAction } from "@/lib/booking/price-token-actions"
import { checkoutSchema } from "@/lib/booking/schemas"
import { decodeDraft } from "@/lib/booking/draft-store"
import { useCart } from "@/lib/cart/use-cart"

type Method = "card" | "transfer" | "cash" | "wallet" | "at_hotel"

export function CheckoutForm({ token }: { token: string }) {
  const t = useTranslations("Booking")
  const router = useRouter()
  const cart = useCart()
  const [pending, startTransition] = useTransition()

  const METHODS: {
    key: Method
    label: string
    desc: string
    icon: typeof CreditCard
  }[] = [
    {
      key: "card",
      label: t("methodCardLabel"),
      desc: t("methodCardDesc"),
      icon: CreditCard,
    },
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
    {
      key: "wallet",
      label: t("methodWalletLabel"),
      desc: t("methodWalletDesc"),
      icon: Wallet,
    },
    {
      key: "at_hotel",
      label: t("methodAtHotelLabel"),
      desc: t("methodAtHotelDesc"),
      icon: Building2,
    },
  ]
  // "card" échoue systématiquement (aucun provider de paiement en ligne
  // configuré, voir lib/payment/provider.ts::NotConfiguredPaymentProvider)
  // — ne jamais le pré-sélectionner pour ne pas envoyer le premier essai
  // dans une impasse. "at_hotel" est la méthode sans risque par défaut :
  // aucune coordonnée bancaire requise, réservation enregistrée telle quelle.
  const [method, setMethod] = useState<Method>("at_hotel")
  const [acceptCgv, setAcceptCgv] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function onAddToCart() {
    const payload = decodeDraft(token)
    if (!payload?.traveler) {
      toast.error(t("missingTravelerInfo"))
      return
    }
    const { draft, traveler } = payload
    startTransition(async () => {
      // Certification E2E — jamais `draft.unitPriceTnd` seul pour un module
      // hôtel : le serveur revérifie le `priceToken` signé à la recherche
      // avant d'ajouter un montant au panier (voir lib/booking/price-token.ts
      // en tête de fichier pour la preuve live du bug corrigé). Si la
      // vérification échoue, on refuse d'ajouter au panier plutôt que
      // d'afficher un montant non garanti.
      const resolved = await resolveDraftPriceAction(token)
      if (draft.module === "hotel" && !resolved.verified) {
        toast.error(t("priceNotVerifiedToast"))
        return
      }
      const priceTnd =
        resolved.unitPriceTnd * draft.adults +
        (draft.unitChildPriceTnd ?? 0) * draft.children
      cart.add({ module: "hotel", title: draft.offerLabel, priceTnd, draft, traveler })
      toast.success(t("addedToCartToast"))
      router.push("/panier")
    })
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const parsed = checkoutSchema.safeParse({
      paymentMethod: method,
      acceptCgv: acceptCgv as true,
    })
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message ?? t("invalidFieldsError")
      setError(msg)
      return
    }
    const fd = new FormData()
    fd.set("draft", token)
    fd.set("paymentMethod", method)
    startTransition(async () => {
      try {
        await submitCheckoutAction(fd)
      } catch (err) {
        if (err instanceof Error && err.message.includes("NEXT_REDIRECT")) {
          return
        }
        const msg = err instanceof Error ? err.message : t("paymentError")
        setError(msg)
        toast.error(msg)
      }
    })
  }

  return (
    <Card>
      <CardContent className="p-6">
        <form onSubmit={onSubmit} className="space-y-5">
          <div>
            <h3 className="mb-3 text-sm font-semibold tracking-wide uppercase">
              {t("paymentMethodTitle")}
            </h3>
            <div className="grid gap-3 sm:grid-cols-1">
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
                      (active
                        ? "border-sidebar bg-sidebar/5 shadow-sm"
                        : "border-border hover:border-foreground/30")
                    }
                  >
                    <span
                      className={
                        "mt-0.5 inline-flex size-9 items-center justify-center rounded-md " +
                        (active
                          ? "bg-sidebar text-white"
                          : "bg-muted text-muted-foreground")
                      }
                    >
                      <Icon className="size-5" />
                    </span>
                    <span className="flex-1">
                      <span className="block text-sm font-semibold">
                        {m.label}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {m.desc}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex items-start gap-2">
            <Checkbox
              id="cgv"
              checked={acceptCgv}
              onCheckedChange={(v) => setAcceptCgv(Boolean(v))}
            />
            <Label
              htmlFor="cgv"
              className="text-muted-foreground flex-wrap text-sm leading-snug"
            >
              {t.rich("acceptCgvLabel", {
                cgvLink: (chunks) => (
                  <Link
                    href="/cgv"
                    target="_blank"
                    className="text-foreground underline"
                  >
                    {chunks}
                  </Link>
                ),
                privacyLink: (chunks) => (
                  <Link
                    href="/politique-confidentialite"
                    target="_blank"
                    className="text-foreground underline"
                  >
                    {chunks}
                  </Link>
                ),
              })}
            </Label>
          </div>

          {error ? (
            <div
              className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
              role="alert"
            >
              {error}
            </div>
          ) : null}

          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <ShieldCheck className="size-4 text-emerald-600" />
            {t("securePaymentNotice")}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="w-full sm:flex-1"
              onClick={onAddToCart}
              disabled={pending}
            >
              <ShoppingCart className="mr-2 size-4" />
              {t("addToCartButton")}
            </Button>
            <Button
              type="submit"
              size="lg"
              disabled={pending || !acceptCgv}
              className="w-full sm:flex-1"
            >
              {pending ? t("validatingReservation") : t("confirmAndPay")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
