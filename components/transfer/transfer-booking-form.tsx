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

import { useState } from "react"
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
import { Loader2, MapPin, Car, Calendar, Clock, CreditCard, CheckCircle } from "lucide-react"
import { createTransferBooking } from "@/lib/transfers/actions"
import { calculateTransferPrice, type TransferPricingResult } from "@/lib/transfers/pricing"

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
/* Mock Data (à remplacer par API réelle)                                    */
/* -------------------------------------------------------------------------- */

const MOCK_ZONES = [
  { id: "zone-001", name: "Aéroport Tunis-Carthage (TUN)", type: "airport" },
  { id: "zone-002", name: "Aéroport Enfidha (NBE)", type: "airport" },
  { id: "zone-003", name: "Hôtel Tunis - Centre", type: "hotel" },
  { id: "zone-004", name: "Hôtel Hammamet - Sud", type: "hotel" },
  { id: "zone-005", name: "Hôtel Sousse - Centre", type: "hotel" },
  { id: "zone-006", name: "Gare Tunis", type: "station" },
  { id: "zone-007", name: "Port La Goulette", type: "city" },
]

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

export function TransferBookingForm() {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitSuccess, setSubmitSuccess] = useState<{ reservationId: string; publicRef: string; totalTnd: number } | null>(null)
  const [pricing, setPricing] = useState<TransferPricingResult | null>(null)

  const form = useForm<TransferBookingFormData>({
    resolver: zodResolver(transferBookingSchema),
    defaultValues: {
      fromZoneId: "",
      toZoneId: "",
      vehicleType: "sedan",
      pickupDate: "",
      pickupTime: "",
      pax: 1,
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
  const updatePricing = () => {
    if (watchedFromZoneId && watchedToZoneId && watchedPickupDate && watchedPickupTime) {
      const result = calculateTransferPrice({
        fromZoneId: watchedFromZoneId,
        toZoneId: watchedToZoneId,
        vehicleType: watchedVehicleType,
        pickupDate: watchedPickupDate,
        pickupTime: watchedPickupTime,
        agencyId: "00000000-0000-0000-0000-000000000001", // TODO: depuis session
      })
      setPricing(result)
    } else {
      setPricing(null)
    }
  }

  // Mettre à jour le pricing quand les champs pertinents changent
  useState(() => {
    updatePricing()
  })

  const onSubmit = async (data: TransferBookingFormData) => {
    setIsSubmitting(true)
    setSubmitError(null)
    setSubmitSuccess(null)

    try {
      const result = await createTransferBooking({
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
        setSubmitSuccess({
          reservationId: result.reservationId,
          publicRef: result.publicRef,
          totalTnd: result.totalTnd,
        })
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Erreur inconnue")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (submitSuccess) {
    return (
      <Card className="max-w-2xl mx-auto rounded-lg border-2 border-green-500/20">
        <CardHeader className="bg-green-50 rounded-t-lg">
          <CardTitle className="text-green-700 flex items-center gap-2">
            <CheckCircle className="w-6 h-6" />
            Réservation Confirmée
          </CardTitle>
          <CardDescription className="text-green-600">
            Votre réservation de transfert a été enregistrée avec succès.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4">
            <p className="text-sm font-medium text-green-700">N° Réservation</p>
            <p className="text-2xl font-bold text-green-700">{submitSuccess.publicRef}</p>
          </div>
          <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4">
            <p className="text-sm font-medium text-green-700">Montant débité</p>
            <p className="text-2xl font-bold text-green-700">{submitSuccess.totalTnd.toFixed(3)} DT</p>
          </div>
          <Button onClick={() => window.location.reload()} className="w-full bg-green-600 hover:bg-green-700 text-white rounded-lg">
            Nouvelle Réservation
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold text-[#1e3a8a]">Réservation de Transfert</h1>
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
        <Card className="rounded-lg border-2 border-[#1e3a8a]/10">
          <CardHeader className="bg-[#1e3a8a]/5 rounded-t-lg">
            <CardTitle className="flex items-center gap-2 text-[#1e3a8a]">
              <MapPin className="w-5 h-5" />
              Trajet
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-[#1e3a8a]" htmlFor="fromZoneId">Zone de départ</Label>
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
                    {MOCK_ZONES.map((zone) => (
                      <SelectItem key={zone.id} value={zone.id}>
                        {zone.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-[#1e3a8a]" htmlFor="toZoneId">Zone d'arrivée</Label>
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
                    {MOCK_ZONES.map((zone) => (
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
        <Card className="rounded-lg border-2 border-[#1e3a8a]/10">
          <CardHeader className="bg-[#1e3a8a]/5 rounded-t-lg">
            <CardTitle className="flex items-center gap-2 text-[#1e3a8a]">
              <Car className="w-5 h-5" />
              Véhicule & Horaires
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-[#1e3a8a]" htmlFor="vehicleType">Type de véhicule</Label>
                <Select
                  value={watchedVehicleType}
                  onValueChange={(v) => {
                    form.setValue("vehicleType", v as any)
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
                <Label className="text-sm font-medium text-[#1e3a8a]" htmlFor="pax">Nombre de passagers</Label>
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
                <Label className="text-sm font-medium text-[#1e3a8a]" htmlFor="pickupDate">Date de prise en charge</Label>
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
                <Label className="text-sm font-medium text-[#1e3a8a]" htmlFor="pickupTime">Heure de prise en charge</Label>
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
                <Label className="text-sm font-medium text-[#1e3a8a]" htmlFor="luggageCount">Bagages (optionnel)</Label>
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
                <Label className="text-sm font-medium text-[#1e3a8a]" htmlFor="flightNumber">Numéro de vol (optionnel)</Label>
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
        <Card className="rounded-lg border-2 border-[#1e3a8a]/10">
          <CardHeader className="bg-[#1e3a8a]/5 rounded-t-lg">
            <CardTitle className="text-[#1e3a8a]">Informations du client</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-[#1e3a8a]">Prénom *</Label>
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
                <Label className="text-sm font-medium text-[#1e3a8a]">Nom *</Label>
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
                <Label className="text-sm font-medium text-[#1e3a8a]">Téléphone *</Label>
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
                <Label className="text-sm font-medium text-[#1e3a8a]">Email</Label>
                <Input
                  type="email"
                  {...form.register("customer.email")}
                  placeholder="email@example.com"
                  className="rounded-lg"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-[#1e3a8a]">CIN (optionnel)</Label>
              <Input
                {...form.register("customer.civicId")}
                placeholder="12345678"
                className="rounded-lg"
              />
            </div>
          </CardContent>
        </Card>

        {/* Pricing Summary */}
        {pricing && (
          <Card className="rounded-lg border-2 border-[#1e3a8a]/10 bg-[#1e3a8a]/5">
            <CardHeader className="bg-[#1e3a8a]/10 rounded-t-lg">
              <CardTitle className="flex items-center gap-2 text-[#1e3a8a]">
                <CreditCard className="w-5 h-5" />
                Devis
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              <div className="flex justify-between items-center">
                <span className="text-sm sm:text-base">Prix de base</span>
                <span className="font-semibold text-[#1e3a8a]">{pricing.basePriceTnd.toFixed(3)} DT</span>
              </div>
              {pricing.nightSurchargeAmount > 0 && (
                <div className="flex justify-between items-center text-[#f59e0b]">
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
              <Separator className="bg-[#1e3a8a]/20" />
              <div className="flex justify-between items-center text-lg sm:text-xl">
                <span className="font-semibold text-[#1e3a8a]">Total TTC</span>
                <span className="font-bold text-[#f59e0b]">{pricing.totalTnd.toFixed(3)} DT</span>
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
          className="w-full bg-[#1e3a8a] hover:bg-[#1e3a8a]/90 text-white rounded-lg"
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
