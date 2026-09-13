/**
 * ActivityGuestBookingForm — tunnel de réservation Attraction B2C
 * (Phase 13.1, gap #1).
 *
 * Même modèle que `PackageGuestBookingForm` (Phase 12) — sélection d'une
 * session (date + horaires + capacité) au lieu d'un départ, même contact
 * principal, même sélection de mode de règlement.
 */

"use client"

import { useState } from "react"
import { useRouter } from "@/i18n/navigation"
import { useTranslations, useLocale } from "next-intl"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Checkbox } from "@/components/ui/checkbox"
import { Loader2, Users, Calendar, CreditCard, Banknote, Wallet, ShoppingCart } from "lucide-react"
import { createGuestActivityBooking } from "@/lib/activities/guest-booking-actions"
import { activityGuestBookingSchema, type ActivityGuestBookingInput } from "@/lib/activities/schemas"
import type { GuestPaymentMethod } from "@/lib/booking/guest-actions"
import { CancellationPolicyDisplay } from "@/components/booking/cancellation-policy-display"
import type { ResolvedPolicy } from "@/lib/booking/policy-engine"
import { useCart } from "@/lib/cart/use-cart"
import { getIntlLocale } from "@/lib/i18n-date"

interface SessionOption {
  id: string
  sessionDate: string
  sessionStart: string
  sessionEnd: string
  capacityLeft: number
  adultPriceTnd: number
  childPriceTnd?: number
}

interface ActivityGuestBookingFormProps {
  activityId: string
  activityTitle: string
  sessions: SessionOption[]
  defaultSessionId?: string
}

export function ActivityGuestBookingForm({
  activityId,
  activityTitle,
  sessions,
  defaultSessionId,
}: ActivityGuestBookingFormProps) {
  const router = useRouter()
  const cart = useCart()
  const t = useTranslations("Attractions")
  const locale = useLocale()
  const intlLocale = getIntlLocale(locale)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const METHODS: { key: GuestPaymentMethod; label: string; desc: string; icon: typeof CreditCard }[] = [
    { key: "card", label: t("methodCard"), desc: t("methodCardDesc"), icon: CreditCard },
    { key: "transfer", label: t("methodTransfer"), desc: t("methodTransferDesc"), icon: Banknote },
    { key: "cash", label: t("methodCash"), desc: t("methodCashDesc"), icon: Wallet },
  ]
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [method, setMethod] = useState<GuestPaymentMethod>("card")
  const [acceptCgv, setAcceptCgv] = useState(false)
  const [policyAccepted, setPolicyAccepted] = useState(false)
  const [resolvedPolicy, setResolvedPolicy] = useState<ResolvedPolicy | null | undefined>(undefined)

  const form = useForm<ActivityGuestBookingInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(activityGuestBookingSchema) as any,
    defaultValues: {
      activityId,
      sessionId: defaultSessionId ?? sessions[0]?.id ?? "",
      adults: 1,
      children: 0,
      childrenAges: [],
      traveler: {
        civility: "M",
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        civicIdType: "cin",
        civicId: "",
        birthDate: "",
        nationality: "",
      },
    },
  })

  const watchedSessionId = useWatch({ control: form.control, name: "sessionId" })
  const watchedAdults = useWatch({ control: form.control, name: "adults" }) ?? 1
  const watchedChildren = useWatch({ control: form.control, name: "children" }) ?? 0
  const watchedChildrenAges = useWatch({ control: form.control, name: "childrenAges" }) ?? []
  const watchedCivicIdType = useWatch({ control: form.control, name: "traveler.civicIdType" })
  const watchedCivility = useWatch({ control: form.control, name: "traveler.civility" })

  const selectedSession = sessions.find((s) => s.id === watchedSessionId)
  const adultPrice = selectedSession?.adultPriceTnd ?? 0
  const childPrice = selectedSession?.childPriceTnd ?? adultPrice * 0.5
  const totalPrice = adultPrice * watchedAdults + childPrice * watchedChildren

  function setChildrenCount(n: number) {
    form.setValue("children", n)
    const ages = [...watchedChildrenAges]
    if (n > ages.length) {
      while (ages.length < n) ages.push(0)
    } else {
      ages.length = n
    }
    form.setValue("childrenAges", ages)
  }

  // La case d'acceptation n'est exigée que si une politique réelle a été
  // résolue pour cette attraction (voir components/booking/cancellation-policy-display.tsx).
  const policyAcceptanceRequired = resolvedPolicy != null && !policyAccepted

  async function onSubmit(data: ActivityGuestBookingInput) {
    if (!acceptCgv) {
      setSubmitError(t("mustAcceptCgv"))
      return
    }
    if (policyAcceptanceRequired) {
      setSubmitError(t("mustAcceptPolicy"))
      return
    }
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      const result = await createGuestActivityBooking({ booking: { ...data, policyAccepted }, paymentMethod: method })
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

  function onAddToCart(data: ActivityGuestBookingInput) {
    if (policyAcceptanceRequired) {
      setSubmitError(t("mustAcceptPolicy"))
      return
    }
    cart.add({
      module: "activity",
      title: activityTitle,
      priceTnd: totalPrice,
      booking: { ...data, policyAccepted },
    })
    toast.success(t("addedToCartToast"))
    router.push("/panier")
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
              <Calendar className="size-5" />
              {t("sessionTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm font-medium">{activityTitle}</p>
            <Select value={watchedSessionId} onValueChange={(v) => form.setValue("sessionId", v)}>
              <SelectTrigger>
                <SelectValue placeholder={t("chooseDatePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    <div className="flex items-center justify-between gap-4">
                      <span>
                        {new Date(s.sessionDate).toLocaleDateString(intlLocale)} · {s.sessionStart}–{s.sessionEnd}
                      </span>
                      <Badge variant={s.capacityLeft > 5 ? "default" : "destructive"}>
                        {t("placesLeft", { count: s.capacityLeft })}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.sessionId ? (
              <p className="text-destructive text-sm">{form.formState.errors.sessionId.message}</p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-5" />
              {t("participantsTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("adultsLabel")}</Label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  {...form.register("adults", { valueAsNumber: true })}
                />
                {form.formState.errors.adults ? (
                  <p className="text-destructive text-sm">{form.formState.errors.adults.message}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label>{t("childrenLabel")}</Label>
                <Input
                  type="number"
                  min={0}
                  max={50}
                  value={watchedChildren}
                  onChange={(e) => setChildrenCount(Math.max(0, Number(e.target.value) || 0))}
                />
              </div>
            </div>
            {watchedChildren > 0 ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {Array.from({ length: watchedChildren }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Label>{t("childAgeLabel", { n: i + 1 })}</Label>
                    <Input
                      type="number"
                      min={0}
                      max={17}
                      value={watchedChildrenAges[i] ?? 0}
                      onChange={(e) => {
                        const ages = [...watchedChildrenAges]
                        ages[i] = Math.max(0, Number(e.target.value) || 0)
                        form.setValue("childrenAges", ages)
                      }}
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("mainContactTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label>{t("civilityLabel")}</Label>
                <Select
                  value={watchedCivility}
                  onValueChange={(v) => form.setValue("traveler.civility", v as "M" | "Mme" | "Mlle")}
                >
                  <SelectTrigger className="mt-1">
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
                <Label>{t("firstNameLabel")}</Label>
                <Input {...form.register("traveler.firstName")} className="mt-1" placeholder="Hassen" />
                {form.formState.errors.traveler?.firstName ? (
                  <p className="text-destructive mt-1 text-xs">{form.formState.errors.traveler.firstName.message}</p>
                ) : null}
              </div>
              <div>
                <Label>{t("lastNameLabel")}</Label>
                <Input {...form.register("traveler.lastName")} className="mt-1" placeholder="Tarhouni" />
                {form.formState.errors.traveler?.lastName ? (
                  <p className="text-destructive mt-1 text-xs">{form.formState.errors.traveler.lastName.message}</p>
                ) : null}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>{t("emailLabel")}</Label>
                <Input type="email" {...form.register("traveler.email")} className="mt-1" placeholder="vous@email.tn" />
                {form.formState.errors.traveler?.email ? (
                  <p className="text-destructive mt-1 text-xs">{form.formState.errors.traveler.email.message}</p>
                ) : null}
              </div>
              <div>
                <Label>{t("phoneLabel")}</Label>
                <Input type="tel" {...form.register("traveler.phone")} className="mt-1" placeholder="+216 98 140 514" />
                {form.formState.errors.traveler?.phone ? (
                  <p className="text-destructive mt-1 text-xs">{form.formState.errors.traveler.phone.message}</p>
                ) : null}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label>{t("idTypeLabel")}</Label>
                <Select
                  value={watchedCivicIdType}
                  onValueChange={(v) => form.setValue("traveler.civicIdType", v as "cin" | "passport")}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cin">{t("idTypeCin")}</SelectItem>
                    <SelectItem value="passport">{t("idTypePassport")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label>
                  {t("idNumberLabel", {
                    type: watchedCivicIdType === "cin" ? t("idTypeCinShort") : t("idTypePassportShort"),
                  })}
                </Label>
                <Input {...form.register("traveler.civicId")} className="mt-1" placeholder="12345678" />
                {form.formState.errors.traveler?.civicId ? (
                  <p className="text-destructive mt-1 text-xs">{form.formState.errors.traveler.civicId.message}</p>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Politique d'annulation */}
        <CancellationPolicyDisplay
          productType="activity"
          productId={activityId}
          accepted={policyAccepted}
          onAcceptedChange={setPolicyAccepted}
          onPolicyResolved={setResolvedPolicy}
        />

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
              <Checkbox id="cgv-activity" checked={acceptCgv} onCheckedChange={(v) => setAcceptCgv(Boolean(v))} />
              <Label htmlFor="cgv-activity" className="text-muted-foreground text-sm leading-snug">
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
              <span className="text-sm">{t("adultsSummary", { n: watchedAdults })}</span>
              <span className="font-medium">{(adultPrice * watchedAdults).toFixed(3)} DT</span>
            </div>
            {watchedChildren > 0 ? (
              <div className="flex items-center justify-between">
                <span className="text-sm">{t("childrenSummary", { n: watchedChildren })}</span>
                <span className="font-medium">{(childPrice * watchedChildren).toFixed(3)} DT</span>
              </div>
            ) : null}
            <Separator />
            <div className="flex items-center justify-between text-lg">
              <span className="font-semibold">{t("totalTtc")}</span>
              <span className="font-bold text-teal-700">{totalPrice.toFixed(3)} DT</span>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full sm:flex-1"
            disabled={!watchedSessionId || policyAcceptanceRequired}
            onClick={form.handleSubmit(onAddToCart)}
          >
            <ShoppingCart className="mr-2 size-4" />
            {t("addToCart")}
          </Button>
          <Button
            type="submit"
            size="lg"
            className="w-full sm:flex-1"
            disabled={isSubmitting || !watchedSessionId || !acceptCgv || policyAcceptanceRequired}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                {t("processing")}
              </>
            ) : (
              t("confirmAndPay")
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
