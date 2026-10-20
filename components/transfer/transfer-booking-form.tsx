/**
 * TransferBookingForm — Composant client pour réservation de transfert
 *
 * Fonctionnalités :
 *   - Sélection des zones (départ / arrivée)
 *   - Choix du type de véhicule
 *   - Saisie date/heure de prise en charge
 *   - Calcul du devis en temps réel (avec majoration nuit)
 *   - Validation react-hook-form + Zod
 *   - Soumission via Server Action createTransferBooking
 */

"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, MapPin, Car, CreditCard } from "lucide-react"
import { createGuestTransferBooking } from "@/lib/transfers/guest-booking-actions"
import {
  calculateTransferPrice,
  type TransferPricingResult,
} from "@/lib/transfers/pricing"
import type { CatalogTransferZone } from "@/lib/db/schema"

/* -------------------------------------------------------------------------- */
/* Zod Schema                                                                 */
/* -------------------------------------------------------------------------- */

const transferBookingSchema = z.object({
  fromZoneId: z.string().uuid("Zone de départ invalide"),
  toZoneId: z.string().uuid("Zone d'arrivée invalide"),
  vehicleType: z.enum(["sedan", "van", "minibus", "bus", "luxury"]),
  pickupDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format date invalide (YYYY-MM-DD)"),
  pickupTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Format heure invalide (HH:MM)"),
  pax: z
    .number()
    .int()
    .min(1, "Au moins 1 passager")
    .max(50, "Maximum 50 passagers"),
  luggageCount: z.number().int().min(0).max(20).optional(),
  flightNumber: z.string().optional(),
  flightArrivalAt: z.string().optional(),
  customer: z.object({
    firstName: z.string().min(2, "Prénom requis (min 2 caractères)"),
    lastName: z.string().min(2, "Nom requis (min 2 caractères)"),
    phone: z.string().min(8, "Numéro de téléphone invalide"),
    email: z.string().email("Email invalide").optional().or(z.literal("")),
    civicId: z.string().optional(),
  }),
})

type TransferBookingFormData = z.infer<typeof transferBookingSchema>

/* -------------------------------------------------------------------------- */
/* Props                                                                      */
/* -------------------------------------------------------------------------- */

export interface TransferBookingFormPrefill {
  fromZoneId?: string
  toZoneId?: string
  vehicleType?: "sedan" | "van" | "minibus" | "bus" | "luxury"
  pickupDate?: string
  pickupTime?: string
  pax?: number
}

interface TransferBookingFormProps {
  /** Zones réelles (catalog_transfer_zones) — jamais de données inventées. */
  zones: CatalogTransferZone[]
  agencyId: string
  prefill?: TransferBookingFormPrefill
  /** CAMPAIGN-LINK-01 — indice optionnel depuis ?campaign=<uuid> dans l'URL. */
  campaignId?: string
}

const VEHICLE_ICONS: Record<string, string> = {
  sedan: "🚗",
  van: "🚐",
  minibus: "🚌",
  bus: "🚌",
  luxury: "🏎️",
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export function TransferBookingForm({
  zones,
  agencyId,
  prefill,
  campaignId,
}: TransferBookingFormProps) {
  const t = useTranslations("Transferts")
  const VEHICLE_TYPES = [
    { id: "sedan", name: t("vehicleSedanOption"), icon: VEHICLE_ICONS.sedan },
    { id: "van", name: t("vehicleVanOption"), icon: VEHICLE_ICONS.van },
    {
      id: "minibus",
      name: t("vehicleMinibusOption"),
      icon: VEHICLE_ICONS.minibus,
    },
    { id: "bus", name: t("vehicleBusOption"), icon: VEHICLE_ICONS.bus },
    {
      id: "luxury",
      name: t("vehicleLuxuryOption"),
      icon: VEHICLE_ICONS.luxury,
    },
  ]
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [pricing, setPricing] = useState<TransferPricingResult | null>(null)
  const [pricingError, setPricingError] = useState<string | null>(null)

  const form = useForm<TransferBookingFormData>({
    resolver: zodResolver(transferBookingSchema),
    defaultValues: {
      fromZoneId: prefill?.fromZoneId ?? "",
      toZoneId: prefill?.toZoneId ?? "",
      vehicleType: prefill?.vehicleType ?? "sedan",
      pickupDate: prefill?.pickupDate ?? "",
      pickupTime: prefill?.pickupTime ?? "",
      pax: prefill?.pax ?? 1,
      luggageCount: 0,
      flightNumber: "",
      flightArrivalAt: "",
      customer: {
        firstName: "",
        lastName: "",
        phone: "",
        email: "",
        civicId: "",
      },
    },
  })

  // eslint-disable-next-line react-hooks/incompatible-library
  const watchedFromZoneId = form.watch("fromZoneId")
  const watchedToZoneId = form.watch("toZoneId")
  const watchedVehicleType = form.watch("vehicleType")
  const watchedPickupDate = form.watch("pickupDate")
  const watchedPickupTime = form.watch("pickupTime")
  // Calcul du devis en temps réel
  const updatePricing = async () => {
    if (
      watchedFromZoneId &&
      watchedToZoneId &&
      watchedPickupDate &&
      watchedPickupTime
    ) {
      setPricingError(null)
      const result = await calculateTransferPrice({
        fromZoneId: watchedFromZoneId,
        toZoneId: watchedToZoneId,
        vehicleType: watchedVehicleType,
        pickupDate: watchedPickupDate,
        pickupTime: watchedPickupTime,
        agencyId,
      })
      if (!result) {
        setPricing(null)
        setPricingError(t("noPricingForRouteVehicle"))
        return
      }
      setPricing(result)
    } else {
      setPricing(null)
      setPricingError(null)
    }
  }

  // Calcule le devis initial si le formulaire est pré-rempli (venant de /transferts/resultats)
  useEffect(() => {
    updatePricing()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une seule fois au montage ; les changements suivants sont déclenchés explicitement par les handlers onChange/onValueChange
  }, [])

  const onSubmit = async (data: TransferBookingFormData) => {
    setIsSubmitting(true)
    setSubmitError(null)

    try {
      const result = await createGuestTransferBooking({
        fromZoneId: data.fromZoneId,
        toZoneId: data.toZoneId,
        vehicleType: data.vehicleType,
        pickupDate: data.pickupDate,
        pickupTime: data.pickupTime,
        pax: data.pax,
        luggageCount: data.luggageCount,
        flightNumber: data.flightNumber,
        flightArrivalAt: data.flightArrivalAt,
        customer: data.customer,
        campaignId,
      })

      if (!result.ok) {
        setSubmitError(result.error)
      } else {
        router.push(
          `/booking/confirmation/${result.publicRef}?token=${result.guestAccessToken}`,
        )
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : t("unknownError"))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 sm:px-6 lg:px-8">
      <div className="space-y-2">
        <h1 className="text-sidebar text-2xl font-bold sm:text-3xl">
          {t("title")}
        </h1>
        <p className="text-muted-foreground text-sm sm:text-base">
          {t("bookingFormSubtitle")}
        </p>
      </div>

      {submitError && (
        <Alert variant="destructive" className="rounded-lg">
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Zones Selection */}
        <Card className="border-sidebar/10 rounded-lg border-2">
          <CardHeader className="bg-sidebar/5 rounded-t-lg">
            <CardTitle className="text-sidebar flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              {t("yourTripKicker")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label
                  className="text-sidebar text-sm font-medium"
                  htmlFor="fromZoneId"
                >
                  {t("fromZoneLabel")}
                </Label>
                <Select
                  value={watchedFromZoneId}
                  onValueChange={(v) => {
                    form.setValue("fromZoneId", v)
                    updatePricing()
                  }}
                >
                  <SelectTrigger id="fromZoneId" className="rounded-lg">
                    <SelectValue placeholder={t("selectZonePlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {zones.length === 0 ? (
                      <SelectItem value="_" disabled>
                        {t("noZoneAvailable")}
                      </SelectItem>
                    ) : (
                      zones.map((zone) => (
                        <SelectItem key={zone.id} value={zone.id}>
                          {zone.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label
                  className="text-sidebar text-sm font-medium"
                  htmlFor="toZoneId"
                >
                  {t("toZoneLabel")}
                </Label>
                <Select
                  value={watchedToZoneId}
                  onValueChange={(v) => {
                    form.setValue("toZoneId", v)
                    updatePricing()
                  }}
                >
                  <SelectTrigger id="toZoneId" className="rounded-lg">
                    <SelectValue placeholder={t("selectZonePlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {zones
                      .filter((zone) => zone.id !== watchedFromZoneId)
                      .map((zone) => (
                        <SelectItem key={zone.id} value={zone.id}>
                          {zone.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Vehicle & Date */}
        <Card className="border-sidebar/10 rounded-lg border-2">
          <CardHeader className="bg-sidebar/5 rounded-t-lg">
            <CardTitle className="text-sidebar flex items-center gap-2">
              <Car className="h-5 w-5" />
              {t("vehicleScheduleSectionTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label
                  className="text-sidebar text-sm font-medium"
                  htmlFor="vehicleType"
                >
                  {t("vehicleTypeLabel")}
                </Label>
                <Select
                  value={watchedVehicleType}
                  onValueChange={(v) => {
                    form.setValue(
                      "vehicleType",
                      v as "sedan" | "van" | "minibus" | "bus" | "luxury",
                    )
                    updatePricing()
                  }}
                >
                  <SelectTrigger id="vehicleType" className="rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VEHICLE_TYPES.map((vt) => (
                      <SelectItem key={vt.id} value={vt.id}>
                        <div className="flex items-center gap-2">
                          <span>{vt.icon}</span>
                          <span>{vt.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label
                  className="text-sidebar text-sm font-medium"
                  htmlFor="pax"
                >
                  {t("passengersCountLabel")}
                </Label>
                <Input
                  id="pax"
                  type="number"
                  min={1}
                  max={50}
                  className="rounded-lg"
                  {...form.register("pax", { valueAsNumber: true })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label
                  className="text-sidebar text-sm font-medium"
                  htmlFor="pickupDate"
                >
                  {t("pickupDateLabel")}
                </Label>
                <Input
                  id="pickupDate"
                  type="date"
                  className="rounded-lg"
                  {...form.register("pickupDate")}
                  onChange={(e) => {
                    form.setValue("pickupDate", e.target.value)
                    updatePricing()
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label
                  className="text-sidebar text-sm font-medium"
                  htmlFor="pickupTime"
                >
                  {t("pickupTimeLabel")}
                </Label>
                <Input
                  id="pickupTime"
                  type="time"
                  className="rounded-lg"
                  {...form.register("pickupTime")}
                  onChange={(e) => {
                    form.setValue("pickupTime", e.target.value)
                    updatePricing()
                  }}
                />
                {watchedPickupTime && (
                  <p className="text-muted-foreground text-xs">
                    {watchedPickupTime >= "21" || watchedPickupTime < "06"
                      ? t("nightRateApplied")
                      : t("dayRate")}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label
                  className="text-sidebar text-sm font-medium"
                  htmlFor="luggageCount"
                >
                  {t("luggageCountLabel")}
                </Label>
                <Input
                  id="luggageCount"
                  type="number"
                  min={0}
                  max={20}
                  placeholder="0"
                  className="rounded-lg"
                  {...form.register("luggageCount", { valueAsNumber: true })}
                />
              </div>

              <div className="space-y-2">
                <Label
                  className="text-sidebar text-sm font-medium"
                  htmlFor="flightNumber"
                >
                  {t("flightNumberLabel")}
                </Label>
                <Input
                  id="flightNumber"
                  placeholder="Ex: TU123"
                  className="rounded-lg"
                  {...form.register("flightNumber")}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Customer Info */}
        <Card className="border-sidebar/10 rounded-lg border-2">
          <CardHeader className="bg-sidebar/5 rounded-t-lg">
            <CardTitle className="text-sidebar">
              {t("customerInfoSectionTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-sidebar text-sm font-medium">
                  {t("firstNameLabel")}
                </Label>
                <Input
                  {...form.register("customer.firstName")}
                  placeholder="Ahmed"
                  className={
                    form.formState.errors.customer?.firstName
                      ? "rounded-lg border-red-500 focus-visible:ring-red-500"
                      : "rounded-lg"
                  }
                />
                {form.formState.errors.customer?.firstName && (
                  <p className="animate-in fade-in slide-in-from-top-1 text-sm font-medium text-red-500 duration-200">
                    {form.formState.errors.customer.firstName?.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-sidebar text-sm font-medium">
                  {t("lastNameLabel")}
                </Label>
                <Input
                  {...form.register("customer.lastName")}
                  placeholder="Ben Ali"
                  className={
                    form.formState.errors.customer?.lastName
                      ? "rounded-lg border-red-500 focus-visible:ring-red-500"
                      : "rounded-lg"
                  }
                />
                {form.formState.errors.customer?.lastName && (
                  <p className="animate-in fade-in slide-in-from-top-1 text-sm font-medium text-red-500 duration-200">
                    {form.formState.errors.customer.lastName?.message}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-sidebar text-sm font-medium">
                  {t("phoneLabel")}
                </Label>
                <Input
                  {...form.register("customer.phone")}
                  placeholder="+216 98 123 456"
                  className={
                    form.formState.errors.customer?.phone
                      ? "rounded-lg border-red-500 focus-visible:ring-red-500"
                      : "rounded-lg"
                  }
                />
                {form.formState.errors.customer?.phone && (
                  <p className="animate-in fade-in slide-in-from-top-1 text-sm font-medium text-red-500 duration-200">
                    {form.formState.errors.customer.phone?.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-sidebar text-sm font-medium">
                  {t("emailLabel")}
                </Label>
                <Input
                  type="email"
                  {...form.register("customer.email")}
                  placeholder="email@example.com"
                  className="rounded-lg"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sidebar text-sm font-medium">
                {t("cinLabel")}
              </Label>
              <Input
                {...form.register("customer.civicId")}
                placeholder="12345678"
                className="rounded-lg"
              />
            </div>
          </CardContent>
        </Card>

        {/* Pricing Error */}
        {pricingError && (
          <Alert variant="destructive" className="rounded-lg">
            <AlertDescription>{pricingError}</AlertDescription>
          </Alert>
        )}

        {/* Pricing Summary */}
        {pricing && (
          <Card className="border-sidebar/10 bg-sidebar/5 rounded-lg border-2">
            <CardHeader className="bg-sidebar/10 rounded-t-lg">
              <CardTitle className="text-sidebar flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                {t("quoteCardTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              <div className="flex items-center justify-between">
                <span className="text-sm sm:text-base">
                  {t("basePriceLabel")}
                </span>
                <span className="text-sidebar font-semibold">
                  {pricing.basePriceTnd.toFixed(3)} DT
                </span>
              </div>
              {pricing.nightSurchargeAmount > 0 && (
                <div className="text-accent flex items-center justify-between">
                  <span className="text-sm sm:text-base">
                    {t("nightSurchargeLabel", {
                      percent: pricing.nightSurchargePercent ?? 0,
                    })}
                  </span>
                  <span className="font-semibold">
                    +{pricing.nightSurchargeAmount.toFixed(3)} DT
                  </span>
                </div>
              )}
              {pricing.marginAmount && pricing.marginAmount > 0 && (
                <div className="text-muted-foreground flex items-center justify-between">
                  <span className="text-sm sm:text-base">
                    {t("agencyMarginLabel", {
                      percent: pricing.marginPercent ?? 0,
                    })}
                  </span>
                  <span className="font-semibold">
                    +{pricing.marginAmount.toFixed(3)} DT
                  </span>
                </div>
              )}
              <Separator className="bg-sidebar/20" />
              <div className="flex items-center justify-between text-lg sm:text-xl">
                <span className="text-sidebar font-semibold">
                  {t("totalInclTax")}
                </span>
                <span className="text-accent font-bold">
                  {pricing.totalTnd.toFixed(3)} DT
                </span>
              </div>
              <p className="text-muted-foreground text-sm">
                {t("walletDebitNotice")}
              </p>
            </CardContent>
          </Card>
        )}

        <Button
          type="submit"
          size="lg"
          className="bg-sidebar hover:bg-sidebar/90 w-full rounded-lg text-white"
          disabled={isSubmitting || !pricing}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              <span className="hidden sm:inline">{t("processingLong")}</span>
              <span className="sm:hidden">{t("processingShort")}</span>
            </>
          ) : (
            <>
              <span className="hidden sm:inline">
                {t("confirmBookingLong")}
              </span>
              <span className="sm:hidden">{t("confirmBookingShort")}</span>
            </>
          )}
        </Button>
      </form>
    </div>
  )
}
