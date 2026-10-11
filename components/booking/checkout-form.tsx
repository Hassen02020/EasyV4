"use client"

import { useState, useTransition } from "react"
import { Link, useRouter } from "@/i18n/navigation"
import { toast } from "sonner"
import { useLocale, useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  ShieldCheck,
  ShieldX,
  CreditCard,
  Banknote,
  Wallet,
  Building2,
  ShoppingCart,
  Landmark,
} from "lucide-react"
import { submitCheckoutAction } from "@/lib/booking/actions"
import { resolveDraftPriceAction } from "@/lib/booking/price-token-actions"
import { checkoutSchema } from "@/lib/booking/schemas"
import { decodeDraft } from "@/lib/booking/draft-store"
import { useCart } from "@/lib/cart/use-cart"

type Method =
  | "card"
  | "transfer"
  | "bank_deposit"
  | "cash"
  | "wallet"
  | "at_hotel"

export function CheckoutForm({
  token,
  campaignId,
  walletBalanceTnd = 0,
  totalTnd = 0,
  hotelCancellation,
}: {
  token: string
  /** CAMPAIGN-LINK-01 — indice optionnel depuis ?campaign=<uuid> dans l'URL. */
  campaignId?: string
  walletBalanceTnd?: number
  totalTnd?: number
  /** Politique d'annulation hôtel depuis draft.metadata — affichée avec case à cocher obligatoire. */
  hotelCancellation?: {
    hasFreeCancellation: boolean
    freeCancellationDate?: string
  }
}) {
  const t = useTranslations("Booking")
  const locale = useLocale()
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
      key: "bank_deposit",
      label: t("methodBankDepositLabel"),
      desc: t("methodBankDepositDesc"),
      icon: Landmark,
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
  const [policyAccepted, setPolicyAccepted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const formattedCancellationDate = hotelCancellation?.freeCancellationDate
    ? (() => {
        try {
          return new Date(
            hotelCancellation.freeCancellationDate!,
          ).toLocaleDateString(locale, {
            day: "2-digit",
            month: "long",
            year: "numeric",
          })
        } catch {
          return hotelCancellation.freeCancellationDate
        }
      })()
    : null

  function onAddToCart() {
    const payload = decodeDraft(token)
    if (!payload?.traveler) {
      toast.error(t("missingTravelerInfo"))
      return
    }
    const { draft, traveler } = payload
    // Bug connu corrigé : ce bouton construisait une `CartLineHotel` avec
    // `module: "hotel"` codé en dur quel que soit `draft.module` (le
    // brouillon générique de ce tunnel — voir bootstrapDraftFromParams()
    // dans app/(public)/[locale]/booking/page.tsx — peut porter "flight"/
    // "package"/"omra"/"transfer"/"activity"), donc mal étiqueter le panier
    // pour tout autre module. Le panier (lib/cart/cart-types.ts) ne sait de
    // toute façon construire une ligne valide qu'à partir de CE payload
    // générique `draft`+`traveler` pour le module hôtel — Package/Activité
    // ont leur PROPRE bouton "Ajouter au panier" dédié (voir
    // package-guest-booking-form.tsx/activity-guest-booking-form.tsx) avec
    // leur propre shape `booking`. Donc : jamais mislabelliser, refuser
    // proprement plutôt que fabriquer une ligne pour un module que ce
    // composant ne sait pas représenter.
    if (draft.module !== "hotel") {
      toast.error(t("cartModuleNotSupportedToast"))
      return
    }
    startTransition(async () => {
      // Certification E2E — jamais `draft.unitPriceTnd` seul pour un module
      // hôtel : le serveur revérifie le `priceToken` signé à la recherche
      // avant d'ajouter un montant au panier (voir lib/booking/price-token.ts
      // en tête de fichier pour la preuve live du bug corrigé). Si la
      // vérification échoue, on refuse d'ajouter au panier plutôt que
      // d'afficher un montant non garanti.
      const resolved = await resolveDraftPriceAction(token)
      if (!resolved.verified) {
        toast.error(t("priceNotVerifiedToast"))
        return
      }
      const priceTnd =
        resolved.unitPriceTnd * draft.adults +
        (draft.unitChildPriceTnd ?? 0) * draft.children
      cart.add({
        module: "hotel",
        title: draft.offerLabel,
        priceTnd,
        draft,
        traveler,
      })
      toast.success(t("addedToCartToast"))
      router.push("/panier")
    })
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (hotelCancellation && !policyAccepted) {
      setError(t("mustAcceptPolicy"))
      return
    }
    if (method === "wallet" && walletBalanceTnd < totalTnd) {
      setError(
        t("methodWalletInsufficientDesc", {
          balance: walletBalanceTnd.toFixed(3),
        }),
      )
      return
    }
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
    if (campaignId) fd.set("campaignId", campaignId)
    startTransition(async () => {
      try {
        const result = await submitCheckoutAction(fd)
        if (result && !result.ok) {
          setError(result.error)
          toast.error(result.error)
        }
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
                const isWallet = m.key === "wallet"
                const walletDisabled = isWallet && walletBalanceTnd < totalTnd
                const active = method === m.key
                const Icon = m.icon
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => !walletDisabled && setMethod(m.key)}
                    disabled={walletDisabled}
                    className={
                      "flex items-start gap-3 rounded-lg border p-4 text-left transition-all " +
                      (walletDisabled
                        ? "border-border cursor-not-allowed opacity-50"
                        : active
                          ? "border-sidebar bg-sidebar/5 shadow-sm"
                          : "border-border hover:border-foreground/30")
                    }
                  >
                    <span
                      className={
                        "mt-0.5 inline-flex size-9 items-center justify-center rounded-md " +
                        (active && !walletDisabled
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
                        {isWallet
                          ? walletDisabled
                            ? t("methodWalletInsufficientDesc", {
                                balance: walletBalanceTnd.toFixed(3),
                              })
                            : t("methodWalletBalanceDesc", {
                                balance: walletBalanceTnd.toFixed(3),
                              })
                          : m.desc}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {hotelCancellation && (
            <div
              className={
                "space-y-3 rounded-lg border p-4 " +
                (hotelCancellation.hasFreeCancellation
                  ? "border-emerald-200"
                  : "border-amber-200")
              }
            >
              <div className="flex items-center gap-2">
                {hotelCancellation.hasFreeCancellation ? (
                  <ShieldCheck className="size-5 shrink-0 text-emerald-600" />
                ) : (
                  <ShieldX className="size-5 shrink-0 text-amber-600" />
                )}
                <p className="text-sm font-semibold">{t("policyTitle")}</p>
              </div>
              <p
                className={
                  "text-sm " +
                  (hotelCancellation.hasFreeCancellation
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-amber-700 dark:text-amber-400")
                }
              >
                {hotelCancellation.hasFreeCancellation
                  ? formattedCancellationDate
                    ? t("freeCancellationUntilLabel", {
                        date: formattedCancellationDate,
                      })
                    : t("freeCancellationAvailable")
                  : t("nonRefundable")}
              </p>
              <div className="flex items-start gap-2 border-t pt-3">
                <Checkbox
                  id="hotel-policy"
                  checked={policyAccepted}
                  onCheckedChange={(v) => setPolicyAccepted(Boolean(v))}
                />
                <Label
                  htmlFor="hotel-policy"
                  className="text-muted-foreground text-sm leading-snug"
                >
                  {t("acceptPolicyLabel")}
                </Label>
              </div>
            </div>
          )}

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
              disabled={
                pending ||
                !acceptCgv ||
                (!!hotelCancellation && !policyAccepted)
              }
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
