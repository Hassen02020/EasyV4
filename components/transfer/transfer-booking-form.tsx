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
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, MapPin, Car, Calendar, Clock, CreditCard } from "lucide-react"
import { createGuestTransferBooking } from "@/lib/transfers/guest-booking-actions"
import { calculateTransferPrice, type TransferPricingResult } from "@/lib/transfers/pricing"
import type { CatalogTransferZone } from "@/lib/db/schema"

/* -------------------------------------------------------------------------- */
/* Zod Schema                                                                 */
/* -------------------------------------------------------------------------- */

const transferBookingSchema = z.object({
  fromZoneId: z.string().uuid("Zone de départ invalide"),
  toZoneId: z.string().uuid("Zone d'arrivée invalide"),
  vehicleType: z.enum(["sedan", "van", "minibus", "bus", "luxury"]),
  pickupDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format date invalide (YYYY-MM-DD)"),
  pickupTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Format heure invalide (HH:MM)"),
  pax: z.number().int().min(1, "Au moins 1 passager").max(50, "Maximum 50 passagers"),
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
}

const VEHICLE_TYPES = [
  { id: "sedan", name: "Sedan (4 places)", capacity: 4, icon: "🚗" },
  { id: "van", name: "Van (8 places)", capacity: 8, icon: "🚐" },
  { id: "minibus", name: "Minibus (16 places)", capacity: 16, icon: "🚌" },
  { id: "bus", name: "Bus (30 places)", capacity: 30, icon: "🚌" },
  { id: "luxury", name: "Luxury (4 places)", capacity: 4, icon: "🏎️" },
]

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export function TransferBookingForm({ zones, agencyId, prefill }: TransferBookingFormProps) {
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

  const watchedFromZoneId = form.watch("fromZoneId")
  const watchedToZoneId = form.watch("toZoneId")
  const watchedVehicleType = form.watch("vehicleType")
  const watchedPickupDate = form.watch("pickupDate")
  const watchedPickupTime = form.watch("pickupTime")
  const watchedPax = form.watch("pax")

  // Calcul du devis en temps réel
  const updatePricing = async () => {
    if (watchedFromZoneId && watchedToZoneId && watchedPickupDate && watchedPickupTime) {
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
        setPricingError("Aucun tarif configuré pour cet itinéraire et ce véhicule.")
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
      })

      if (!result.ok) {
        setSubmitError(result.error)
      } else {
        router.push(`/booking/confirmation/${result.publicRef}?token=${result.guestAccessToken}`)
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Erreur inconnue")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold text-sidebar">Réservation de Transfert</h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Sélectionnez vos zones de départ/arrivée et obtenez un devis instantané.
        </p>
      </div>

      {submitError && (
        <Alert variant="destructive" className="rounded-lg">
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Zones Selection */}
        <Card className="rounded-lg border-2 border-sidebar/10">
          <CardHeader className="bg-sidebar/5 rounded-t-lg">
            <CardTitle className="flex items-center gap-2 text-sidebar">
              <MapPin className="w-5 h-5" />
              Trajet
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-sidebar" htmlFor="fromZoneId">Zone de départ</Label>
                <Select
                  value={watchedFromZoneId}
                  onValueChange={(v) => {
                    form.setValue("fromZoneId", v)
                    updatePricing()
                  }}
                >
                  <SelectTrigger id="fromZoneId" className="rounded-lg">
                    <SelectValue placeholder="Choisir une zone" />
                  </SelectTrigger>
                  <SelectContent>
                    {zones.length === 0 ? (
                      <SelectItem value="_" disabled>
                        Aucune zone disponible
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
                <Label className="text-sm font-medium text-sidebar" htmlFor="toZoneId">Zone d&apos;arrivée</Label>
                <Select
                  value={watchedToZoneId}
                  onValueChange={(v) => {
                    form.setValue("toZoneId", v)
                    updatePricing()
                  }}
                >
                  <SelectTrigger id="toZoneId" className="rounded-lg">
                    <SelectValue placeholder="Choisir une zone" />
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
        <Card className="rounded-lg border-2 border-sidebar/10">
          <CardHeader className="bg-sidebar/5 rounded-t-lg">
            <CardTitle className="flex items-center gap-2 text-sidebar">
              <Car className="w-5 h-5" />
              Véhicule & Horaires
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-sidebar" htmlFor="vehicleType">Type de véhicule</Label>
                <Select
                  value={watchedVehicleType}
                  onValueChange={(v) => {
                    form.setValue(
                      "vehicleType",
                      v as "sedan" | "van" | "minibus" | "bus" | "luxury"
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
                <Label className="text-sm font-medium text-sidebar" htmlFor="pax">Nombre de passagers</Label>
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-sidebar" htmlFor="pickupDate">Date de prise en charge</Label>
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
                <Label className="text-sm font-medium text-sidebar" htmlFor="pickupTime">Heure de prise en charge</Label>
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
                  <p className="text-xs text-muted-foreground">
                    {watchedPickupTime >= "21" || watchedPickupTime < "06"
                      ? "⚠️ Tarif de nuit appliqué (+20%)"
                      : "Tarif de jour"}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-sidebar" htmlFor="luggageCount">Bagages (optionnel)</Label>
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
                <Label className="text-sm font-medium text-sidebar" htmlFor="flightNumber">Numéro de vol (optionnel)</Label>
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
        <Card className="rounded-lg border-2 border-sidebar/10">
          <CardHeader className="bg-sidebar/5 rounded-t-lg">
            <CardTitle className="text-sidebar">Informations du client</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-sidebar">Prénom *</Label>
                <Input
                  {...form.register("customer.firstName")}
                  placeholder="Ahmed"
                  className={form.formState.errors.customer?.firstName ? "border-red-500 focus-visible:ring-red-500 rounded-lg" : "rounded-lg"}
                />
                {form.formState.errors.customer?.firstName && (
                  <p className="text-sm text-red-500 font-medium animate-in fade-in slide-in-from-top-1 duration-200">
                    {form.formState.errors.customer.firstName?.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-sidebar">Nom *</Label>
                <Input
                  {...form.register("customer.lastName")}
                  placeholder="Ben Ali"
                  className={form.formState.errors.customer?.lastName ? "border-red-500 focus-visible:ring-red-500 rounded-lg" : "rounded-lg"}
                />
                {form.formState.errors.customer?.lastName && (
                  <p className="text-sm text-red-500 font-medium animate-in fade-in slide-in-from-top-1 duration-200">
                    {form.formState.errors.customer.lastName?.message}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-sidebar">Téléphone *</Label>
                <Input
                  {...form.register("customer.phone")}
                  placeholder="+216 98 123 456"
                  className={form.formState.errors.customer?.phone ? "border-red-500 focus-visible:ring-red-500 rounded-lg" : "rounded-lg"}
                />
                {form.formState.errors.customer?.phone && (
                  <p className="text-sm text-red-500 font-medium animate-in fade-in slide-in-from-top-1 duration-200">
                    {form.formState.errors.customer.phone?.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-sidebar">Email</Label>
                <Input
                  type="email"
                  {...form.register("customer.email")}
                  placeholder="email@example.com"
                  className="rounded-lg"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-sidebar">CIN (optionnel)</Label>
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
          <Card className="rounded-lg border-2 border-sidebar/10 bg-sidebar/5">
            <CardHeader className="bg-sidebar/10 rounded-t-lg">
              <CardTitle className="flex items-center gap-2 text-sidebar">
                <CreditCard className="w-5 h-5" />
                Devis
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              <div className="flex justify-between items-center">
                <span className="text-sm sm:text-base">Prix de base</span>
                <span className="font-semibold text-sidebar">{pricing.basePriceTnd.toFixed(3)} DT</span>
              </div>
              {pricing.nightSurchargeAmount > 0 && (
                <div className="flex justify-between items-center text-accent">
                  <span className="text-sm sm:text-base">Majoration nuit ({pricing.nightSurchargePercent}%)</span>
                  <span className="font-semibold">+{pricing.nightSurchargeAmount.toFixed(3)} DT</span>
                </div>
              )}
              {pricing.marginAmount && pricing.marginAmount > 0 && (
                <div className="flex justify-between items-center text-muted-foreground">
                  <span className="text-sm sm:text-base">Marge agence ({pricing.marginPercent}%)</span>
                  <span className="font-semibold">+{pricing.marginAmount.toFixed(3)} DT</span>
                </div>
              )}
              <Separator className="bg-sidebar/20" />
              <div className="flex justify-between items-center text-lg sm:text-xl">
                <span className="font-semibold text-sidebar">Total TTC</span>
                <span className="font-bold text-accent">{pricing.totalTnd.toFixed(3)} DT</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Le montant sera débité de votre wallet Easy2Book.
              </p>
            </CardContent>
          </Card>
        )}

        <Button
          type="submit"
          size="lg"
          className="w-full bg-sidebar hover:bg-sidebar/90 text-white rounded-lg"
          disabled={isSubmitting || !pricing}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              <span className="hidden sm:inline">Traitement en cours...</span>
              <span className="sm:hidden">Traitement...</span>
            </>
          ) : (
            <>
              <span className="hidden sm:inline">Confirmer la Réservation</span>
              <span className="sm:hidden">Confirmer</span>
            </>
          )}
        </Button>
      </form>
    </div>
  )
}
