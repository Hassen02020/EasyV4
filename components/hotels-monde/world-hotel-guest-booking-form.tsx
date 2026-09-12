/**
 * WorldHotelGuestBookingForm — tunnel de réservation Hôtels Monde B2C.
 *
 * Même patron que `components/flights/flight-guest-booking-form.tsx` : une
 * seule page, contact + mode de règlement, pas le tunnel générique
 * `/booking/*`. Un seul formulaire "voyageur" (lead guest) — contrairement
 * à Vols, une réservation hôtelière ne nomme pas chaque occupant, voir
 * lib/hotels-monde/schemas.ts.
 *
 * `offerToken`/`expectedPriceTnd` ne sont jamais modifiables ici : revalidés
 * côté serveur par `lib/hotels-monde/virtual-supplier/engine.ts::book()`
 * (`lib/hotels-monde/guest-booking-actions.ts`) — cette page affiche
 * seulement ce que la recherche a renvoyé, jamais une source de vérité
 * prix/disponibilité.
 */

"use client"

import { useState } from "react"
import { useRouter } from "@/i18n/navigation"
import { useTranslations, useLocale } from "next-intl"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Checkbox } from "@/components/ui/checkbox"
import { Loader2, User, CreditCard, Banknote, Wallet, Building2 } from "lucide-react"
import {
  createGuestWorldHotelBooking,
  type WorldHotelGuestPaymentMethod,
} from "@/lib/hotels-monde/guest-booking-actions"
import { worldHotelGuestBookingSchema, type WorldHotelGuestBookingInput } from "@/lib/hotels-monde/schemas"
import { getIntlLocale } from "@/lib/i18n-date"

export interface WorldHotelBookingOfferSummary {
  offerToken: string
  priceTnd: number
  currency: string
  name: string
  city: string
  country: string
  checkIn: string
  checkOut: string
  nights: number
  adults: number
  rooms: number
  refundable: boolean
  breakfastIncluded: boolean
  stars: number | null
}

export function WorldHotelGuestBookingForm({ offer }: { offer: WorldHotelBookingOfferSummary }) {
  const router = useRouter()
  const t = useTranslations("HotelsMonde")
  const locale = useLocale()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [method, setMethod] = useState<WorldHotelGuestPaymentMethod>("card")
  const [acceptCgv, setAcceptCgv] = useState(false)

  const METHODS: { key: WorldHotelGuestPaymentMethod; label: string; desc: string; icon: typeof CreditCard }[] = [
    { key: "card", label: t("methodCard"), desc: t("methodCardDesc"), icon: CreditCard },
    { key: "transfer", label: t("methodTransfer"), desc: t("methodTransferDesc"), icon: Banknote },
    { key: "cash", label: t("methodCash"), desc: t("methodCashDesc"), icon: Wallet },
  ]

  const form = useForm<WorldHotelGuestBookingInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(worldHotelGuestBookingSchema) as any,
    defaultValues: {
      offerToken: offer.offerToken,
      expectedPriceTnd: offer.priceTnd,
      guest: {
        civility: "M",
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        nationality: "",
      },
      specialRequests: "",
    },
  })

  async function onSubmit(data: WorldHotelGuestBookingInput) {
    if (!acceptCgv) {
      setSubmitError(t("mustAcceptCgv"))
      return
    }
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      const result = await createGuestWorldHotelBooking({ booking: data, paymentMethod: method })
      if (!result.ok) {
        setSubmitError(result.error)
        setIsSubmitting(false)
        return
      }
      router.push(`/booking/confirmation/${result.publicRef}?token=${result.guestAccessToken}`)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : t("unknownError"))
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      {submitError ? (
        <Alert variant="destructive" className="rounded-lg">
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      ) : null}

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="size-5" />
              {t("yourHotelTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">{offer.name}</span>
              <span className="text-muted-foreground">
                {offer.city}, {offer.country}
              </span>
            </div>
            <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
              <span>
                {new Date(offer.checkIn).toLocaleDateString(getIntlLocale(locale))} → {new Date(offer.checkOut).toLocaleDateString(getIntlLocale(locale))}
              </span>
              <span>{t("nightsCount", { n: offer.nights })}</span>
              <span>{t("paxSummary", { adults: offer.adults, rooms: offer.rooms })}</span>
              {offer.refundable ? <span>{t("freeCancellation")}</span> : null}
              {offer.breakfastIncluded ? <span>{t("breakfastIncluded")}</span> : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="size-4" />
              {t("mainGuestTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="guest-civility">{t("civilityLabel")}</Label>
                <Select
                  value={form.watch("guest.civility")}
                  onValueChange={(v) => form.setValue("guest.civility", v as "M" | "Mme" | "Mlle")}
                >
                  <SelectTrigger id="guest-civility" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="M">{t("civilityM")}</SelectItem>
                    <SelectItem value="Mme">{t("civilityMme")}</SelectItem>
                    <SelectItem value="Mlle">{t("civilityMlle")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="guest-firstName">{t("firstNameLabel")}</Label>
                <Input id="guest-firstName" {...form.register("guest.firstName")} className="mt-1" />
                {form.formState.errors.guest?.firstName ? (
                  <p className="text-destructive mt-1 text-xs">{form.formState.errors.guest.firstName.message}</p>
                ) : null}
              </div>
              <div>
                <Label htmlFor="guest-lastName">{t("lastNameLabel")}</Label>
                <Input id="guest-lastName" {...form.register("guest.lastName")} className="mt-1" />
                {form.formState.errors.guest?.lastName ? (
                  <p className="text-destructive mt-1 text-xs">{form.formState.errors.guest.lastName.message}</p>
                ) : null}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="guest-email">{t("emailLabel")}</Label>
                <Input id="guest-email" type="email" {...form.register("guest.email")} className="mt-1" />
                {form.formState.errors.guest?.email ? (
                  <p className="text-destructive mt-1 text-xs">{form.formState.errors.guest.email.message}</p>
                ) : null}
              </div>
              <div>
                <Label htmlFor="guest-phone">{t("phoneLabel")}</Label>
                <Input id="guest-phone" type="tel" {...form.register("guest.phone")} className="mt-1" placeholder="+216 98 140 514" />
                {form.formState.errors.guest?.phone ? (
                  <p className="text-destructive mt-1 text-xs">{form.formState.errors.guest.phone.message}</p>
                ) : null}
              </div>
            </div>
            <div>
              <Label htmlFor="guest-nationality">{t("nationalityLabel")}</Label>
              <Input id="guest-nationality" {...form.register("guest.nationality")} className="mt-1" placeholder={t("nationalityPlaceholder")} />
            </div>
            <div>
              <Label htmlFor="special-requests">{t("specialRequestsLabel")}</Label>
              <Textarea
                id="special-requests"
                {...form.register("specialRequests")}
                className="mt-1"
                placeholder={t("specialRequestsPlaceholder")}
                rows={2}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("paymentMethodTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {METHODS.map((m) => {
              const active = method === m.key
              const Icon = m.icon
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setMethod(m.key)}
                  className={
                    "flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-all " +
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
            <div className="flex items-start gap-2 pt-2">
              <Checkbox id="cgv-hotel-monde" checked={acceptCgv} onCheckedChange={(v) => setAcceptCgv(Boolean(v))} />
              <Label htmlFor="cgv-hotel-monde" className="text-muted-foreground text-sm leading-snug">
                {t("acceptCgv")}
              </Label>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-sidebar/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="size-5" />
              {t("summaryTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm">
                {t("roomsNightsSummary", { rooms: offer.rooms, nights: offer.nights })}
              </span>
              <span className="font-medium">
                {offer.priceTnd.toLocaleString(getIntlLocale(locale))} {offer.currency}
              </span>
            </div>
            <Separator />
            <div className="flex items-center justify-between text-lg">
              <span className="font-semibold">{t("totalTtc")}</span>
              <span className="font-bold text-violet-700">
                {offer.priceTnd.toLocaleString(getIntlLocale(locale))} {offer.currency}
              </span>
            </div>
          </CardContent>
        </Card>

        <Button type="submit" size="lg" className="w-full" disabled={isSubmitting || !acceptCgv}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              {t("processing")}
            </>
          ) : (
            t("confirmAndPay")
          )}
        </Button>
      </form>
    </div>
  )
}
