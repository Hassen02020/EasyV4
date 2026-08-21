/**
 * CarBookingForm — Composant client pour réservation de location de voiture
 *
 * Même architecture que components/transfer/transfer-booking-form.tsx :
 * devis en temps réel via un Server Action pur (calculateCarPrice),
 * soumission via createCarBooking. Validation react-hook-form + Zod.
 */

"use client"

import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, Car, ShieldCheck, CreditCard, CheckCircle, IdCard } from "lucide-react"
import { createCarBooking } from "@/lib/cars/actions"
import { calculateCarPrice, type CarPricingResult } from "@/lib/cars/pricing"
import type { CarLocation, CarCategory } from "@/lib/db/schema"

const INSURANCE_LEVELS: { value: "basic" | "standard" | "premium" | "full"; label: string }[] = [
  { value: "basic", label: "Basique (responsabilité civile)" },
  { value: "standard", label: "Standard (+ dommages collision)" },
  { value: "premium", label: "Premium (+ vol, bris de glace, assistance 24/7)" },
  { value: "full", label: "Tous risques (franchise zéro)" },
]

const carBookingSchema = z.object({
  categoryId: z.string().uuid("Catégorie invalide"),
  pickupLocationId: z.string().uuid("Lieu de prise en charge invalide"),
  dropoffLocationId: z.string().uuid("Lieu de retour invalide"),
  pickupDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format date invalide"),
  pickupTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Format heure invalide"),
  returnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format date invalide"),
  returnTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Format heure invalide"),
  insuranceLevel: z.enum(["basic", "standard", "premium", "full"]),
  driver: z.object({
    firstName: z.string().min(2, "Prénom requis (min 2 caractères)"),
    lastName: z.string().min(2, "Nom requis (min 2 caractères)"),
    phone: z.string().min(8, "Numéro de téléphone invalide"),
    email: z.string().email("Email invalide").optional().or(z.literal("")),
    licenseNumber: z.string().min(4, "Numéro de permis requis"),
    licenseCountry: z.string().optional(),
    birthDate: z.string().optional(),
  }),
})

type CarBookingFormData = z.infer<typeof carBookingSchema>

export interface CarBookingFormPrefill {
  pickupLocationId: string
  dropoffLocationId: string
  categoryId: string
  pickupDate: string
  pickupTime: string
  returnDate: string
  returnTime: string
}

interface CarBookingFormProps {
  agencyId: string
  locations: CarLocation[]
  categories: CarCategory[]
  prefill: CarBookingFormPrefill
}

export function CarBookingForm({ agencyId, locations, categories, prefill }: CarBookingFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitSuccess, setSubmitSuccess] = useState<{ publicRef: string; totalTnd: number } | null>(null)
  const [pricing, setPricing] = useState<CarPricingResult | null>(null)
  const [pricingError, setPricingError] = useState<string | null>(null)

  const form = useForm<CarBookingFormData>({
    resolver: zodResolver(carBookingSchema),
    defaultValues: {
      categoryId: prefill.categoryId,
      pickupLocationId: prefill.pickupLocationId,
      dropoffLocationId: prefill.dropoffLocationId,
      pickupDate: prefill.pickupDate,
      pickupTime: prefill.pickupTime,
      returnDate: prefill.returnDate,
      returnTime: prefill.returnTime,
      insuranceLevel: "basic",
      driver: {
        firstName: "",
        lastName: "",
        phone: "",
        email: "",
        licenseNumber: "",
        licenseCountry: "",
        birthDate: "",
      },
    },
  })

  const watchedCategoryId = form.watch("categoryId")
  const watchedPickupLocationId = form.watch("pickupLocationId")
  const watchedPickupDate = form.watch("pickupDate")
  const watchedPickupTime = form.watch("pickupTime")
  const watchedReturnDate = form.watch("returnDate")
  const watchedReturnTime = form.watch("returnTime")
  const watchedInsuranceLevel = form.watch("insuranceLevel")

  const updatePricing = async () => {
    if (
      watchedCategoryId &&
      watchedPickupLocationId &&
      watchedPickupDate &&
      watchedPickupTime &&
      watchedReturnDate &&
      watchedReturnTime
    ) {
      setPricingError(null)
      const result = await calculateCarPrice({
        categoryId: watchedCategoryId,
        locationId: watchedPickupLocationId,
        pickupAt: `${watchedPickupDate}T${watchedPickupTime}:00`,
        dropoffAt: `${watchedReturnDate}T${watchedReturnTime}:00`,
        insuranceLevel: watchedInsuranceLevel,
        agencyId,
      })
      if (!result) {
        setPricing(null)
        setPricingError("Aucun tarif configuré pour cette catégorie et ce lieu.")
        return
      }
      setPricing(result)
    } else {
      setPricing(null)
      setPricingError(null)
    }
  }

  useEffect(() => {
    updatePricing()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une seule fois au montage ; les changements suivants sont déclenchés explicitement par les handlers onChange/onValueChange
  }, [])

  const onSubmit = async (data: CarBookingFormData) => {
    setIsSubmitting(true)
    setSubmitError(null)
    setSubmitSuccess(null)

    try {
      const result = await createCarBooking({
        categoryId: data.categoryId,
        pickupLocationId: data.pickupLocationId,
        dropoffLocationId: data.dropoffLocationId,
        pickupAt: `${data.pickupDate}T${data.pickupTime}:00`,
        dropoffAt: `${data.returnDate}T${data.returnTime}:00`,
        insuranceLevel: data.insuranceLevel,
        driver: data.driver,
      })

      if (!result.ok) {
        setSubmitError(result.error)
      } else {
        setSubmitSuccess({ publicRef: result.publicRef, totalTnd: result.totalTnd })
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Erreur inconnue")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (submitSuccess) {
    return (
      <Card className="mx-auto max-w-2xl rounded-lg border-2 border-green-500/20">
        <CardHeader className="rounded-t-lg bg-green-50">
          <CardTitle className="flex items-center gap-2 text-green-700">
            <CheckCircle className="h-6 w-6" />
            Réservation Confirmée
          </CardTitle>
          <CardDescription className="text-green-600">
            Votre location de voiture a été enregistrée avec succès.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <div className="rounded-lg border-2 border-green-200 bg-green-50 p-4">
            <p className="text-sm font-medium text-green-700">N° Réservation</p>
            <p className="text-2xl font-bold text-green-700">{submitSuccess.publicRef}</p>
          </div>
          <div className="rounded-lg border-2 border-green-200 bg-green-50 p-4">
            <p className="text-sm font-medium text-green-700">Montant débité</p>
            <p className="text-2xl font-bold text-green-700">{submitSuccess.totalTnd.toFixed(3)} DT</p>
          </div>
          <Button onClick={() => window.location.reload()} className="w-full rounded-lg bg-green-600 text-white hover:bg-green-700">
            Nouvelle Réservation
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 sm:px-6 lg:px-8">
      <div className="space-y-2">
        <h1 className="text-sidebar text-2xl font-bold sm:text-3xl">Réservation de Voiture</h1>
        <p className="text-muted-foreground text-sm sm:text-base">
          Choisissez votre catégorie de véhicule et votre niveau d&apos;assurance, devis instantané.
        </p>
      </div>

      {submitError && (
        <Alert variant="destructive" className="rounded-lg">
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card className="border-sidebar/10 rounded-lg border-2">
          <CardHeader className="bg-sidebar/5 rounded-t-lg">
            <CardTitle className="text-sidebar flex items-center gap-2">
              <Car className="h-5 w-5" />
              Véhicule & Assurance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-sidebar text-sm font-medium">Catégorie</Label>
                <Select
                  value={watchedCategoryId}
                  onValueChange={(v) => {
                    form.setValue("categoryId", v)
                    updatePricing()
                  }}
                >
                  <SelectTrigger className="rounded-lg">
                    <SelectValue placeholder="Choisir une catégorie" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sidebar flex items-center gap-1.5 text-sm font-medium">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Assurance
                </Label>
                <Select
                  value={watchedInsuranceLevel}
                  onValueChange={(v) => {
                    form.setValue("insuranceLevel", v as "basic" | "standard" | "premium" | "full")
                    updatePricing()
                  }}
                >
                  <SelectTrigger className="rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INSURANCE_LEVELS.map((l) => (
                      <SelectItem key={l.value} value={l.value}>
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-sidebar text-sm font-medium">Lieu de prise en charge</Label>
                <Select
                  value={watchedPickupLocationId}
                  onValueChange={(v) => {
                    form.setValue("pickupLocationId", v)
                    updatePricing()
                  }}
                >
                  <SelectTrigger className="rounded-lg">
                    <SelectValue placeholder="Choisir un lieu" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sidebar text-sm font-medium">Lieu de retour</Label>
                <Select
                  value={form.watch("dropoffLocationId")}
                  onValueChange={(v) => form.setValue("dropoffLocationId", v)}
                >
                  <SelectTrigger className="rounded-lg">
                    <SelectValue placeholder="Choisir un lieu" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label className="text-sidebar text-sm font-medium">Prise en charge</Label>
                  <Input
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
                  <Label className="text-sidebar text-sm font-medium">Heure</Label>
                  <Input
                    type="time"
                    className="rounded-lg"
                    {...form.register("pickupTime")}
                    onChange={(e) => {
                      form.setValue("pickupTime", e.target.value)
                      updatePricing()
                    }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label className="text-sidebar text-sm font-medium">Retour</Label>
                  <Input
                    type="date"
                    className="rounded-lg"
                    {...form.register("returnDate")}
                    onChange={(e) => {
                      form.setValue("returnDate", e.target.value)
                      updatePricing()
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sidebar text-sm font-medium">Heure</Label>
                  <Input
                    type="time"
                    className="rounded-lg"
                    {...form.register("returnTime")}
                    onChange={(e) => {
                      form.setValue("returnTime", e.target.value)
                      updatePricing()
                    }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-sidebar/10 rounded-lg border-2">
          <CardHeader className="bg-sidebar/5 rounded-t-lg">
            <CardTitle className="text-sidebar flex items-center gap-2">
              <IdCard className="h-5 w-5" />
              Conducteur principal
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-sidebar text-sm font-medium">Prénom *</Label>
                <Input {...form.register("driver.firstName")} placeholder="Ahmed" className="rounded-lg" />
                {form.formState.errors.driver?.firstName && (
                  <p className="text-sm font-medium text-red-500">{form.formState.errors.driver.firstName.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label className="text-sidebar text-sm font-medium">Nom *</Label>
                <Input {...form.register("driver.lastName")} placeholder="Ben Ali" className="rounded-lg" />
                {form.formState.errors.driver?.lastName && (
                  <p className="text-sm font-medium text-red-500">{form.formState.errors.driver.lastName.message}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-sidebar text-sm font-medium">Téléphone *</Label>
                <Input {...form.register("driver.phone")} placeholder="+216 98 123 456" className="rounded-lg" />
                {form.formState.errors.driver?.phone && (
                  <p className="text-sm font-medium text-red-500">{form.formState.errors.driver.phone.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label className="text-sidebar text-sm font-medium">Email</Label>
                <Input type="email" {...form.register("driver.email")} placeholder="email@example.com" className="rounded-lg" />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label className="text-sidebar text-sm font-medium">N° Permis de conduire *</Label>
                <Input {...form.register("driver.licenseNumber")} placeholder="123456789" className="rounded-lg" />
                {form.formState.errors.driver?.licenseNumber && (
                  <p className="text-sm font-medium text-red-500">{form.formState.errors.driver.licenseNumber.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label className="text-sidebar text-sm font-medium">Pays du permis</Label>
                <Input {...form.register("driver.licenseCountry")} placeholder="Tunisie" className="rounded-lg" />
              </div>
              <div className="space-y-2">
                <Label className="text-sidebar text-sm font-medium">Date de naissance</Label>
                <Input type="date" {...form.register("driver.birthDate")} className="rounded-lg" />
              </div>
            </div>
          </CardContent>
        </Card>

        {pricingError && (
          <Alert variant="destructive" className="rounded-lg">
            <AlertDescription>{pricingError}</AlertDescription>
          </Alert>
        )}

        {pricing && (
          <Card className="bg-sidebar/5 border-sidebar/10 rounded-lg border-2">
            <CardHeader className="bg-sidebar/10 rounded-t-lg">
              <CardTitle className="text-sidebar flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Devis — {pricing.rentalDays} jour{pricing.rentalDays > 1 ? "s" : ""}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              <div className="flex items-center justify-between">
                <span className="text-sm sm:text-base">Location ({pricing.dailyRateTnd.toFixed(3)} DT/jour)</span>
                <span className="text-sidebar font-semibold">{pricing.baseTotalTnd.toFixed(3)} DT</span>
              </div>
              {pricing.insuranceTotalTnd > 0 && (
                <div className="text-accent flex items-center justify-between">
                  <span className="text-sm sm:text-base">Assurance</span>
                  <span className="font-semibold">+{pricing.insuranceTotalTnd.toFixed(3)} DT</span>
                </div>
              )}
              {pricing.marginAmount && pricing.marginAmount > 0 && (
                <div className="text-muted-foreground flex items-center justify-between">
                  <span className="text-sm sm:text-base">Marge agence ({pricing.marginPercent}%)</span>
                  <span className="font-semibold">+{pricing.marginAmount.toFixed(3)} DT</span>
                </div>
              )}
              <Separator className="bg-sidebar/20" />
              <div className="flex items-center justify-between text-lg sm:text-xl">
                <span className="text-sidebar font-semibold">Total TTC</span>
                <span className="text-accent font-bold">{pricing.totalTnd.toFixed(3)} DT</span>
              </div>
              {pricing.depositTnd > 0 && (
                <p className="text-muted-foreground text-xs">
                  Caution de {pricing.depositTnd.toFixed(3)} DT exigée à la prise en charge (non débitée maintenant).
                </p>
              )}
              <p className="text-muted-foreground text-sm">
                Le montant sera débité de votre wallet Easy2Book.
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
              Traitement en cours...
            </>
          ) : (
            "Confirmer la Réservation"
          )}
        </Button>
      </form>
    </div>
  )
}
