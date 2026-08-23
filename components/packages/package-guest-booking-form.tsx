/**
 * PackageGuestBookingForm — tunnel de réservation Voyage Organisé B2C
 * (Phase 12, Partie 9-10).
 *
 * Une seule page (comme Omra) plutôt que le tunnel générique `/booking/*`
 * (dont l'action terminale, `submitCheckoutAction`, est spécifique Hôtel —
 * `confirmHotelWithProvider`/`reservationHotel` — pas un moteur générique
 * malgré l'enum `module` du draft). Contact voyageur réutilisant les mêmes
 * champs que `travelers-form.tsx` (civilité/nom/email/téléphone/pièce
 * d'identité), plus compteurs adultes/enfants et sélection du mode de
 * règlement (même modèle que `checkout-form.tsx`/Omra).
 */

"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Checkbox } from "@/components/ui/checkbox"
import { Loader2, Users, Calendar, CreditCard, Banknote, Wallet } from "lucide-react"
import { createGuestPackageBooking } from "@/lib/packages/booking-actions"
import { packageGuestBookingSchema, type PackageGuestBookingInput } from "@/lib/packages/schemas"
import type { GuestPaymentMethod } from "@/lib/booking/guest-actions"

interface DepartureOption {
  id: string
  departureDate: string
  returnDate: string
  seatsLeft: number
  adultPriceTnd: number
  childPriceTnd?: number
}

interface PackageGuestBookingFormProps {
  packageId: string
  packageTitle: string
  departures: DepartureOption[]
  defaultDepartureId?: string
}

const METHODS: { key: GuestPaymentMethod; label: string; desc: string; icon: typeof CreditCard }[] = [
  { key: "card", label: "Carte bancaire", desc: "Paiement en ligne immédiat", icon: CreditCard },
  {
    key: "transfer",
    label: "Virement bancaire",
    desc: "Coordonnées de virement envoyées par email — voucher émis après confirmation du règlement",
    icon: Banknote,
  },
  {
    key: "cash",
    label: "Espèces en agence",
    desc: "Réservation maintenue en attente de paiement — voucher émis après confirmation du règlement",
    icon: Wallet,
  },
]

export function PackageGuestBookingForm({
  packageId,
  packageTitle,
  departures,
  defaultDepartureId,
}: PackageGuestBookingFormProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [method, setMethod] = useState<GuestPaymentMethod>("card")
  const [acceptCgv, setAcceptCgv] = useState(false)

  const form = useForm<PackageGuestBookingInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(packageGuestBookingSchema) as any,
    defaultValues: {
      packageId,
      departureId: defaultDepartureId ?? departures[0]?.id ?? "",
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

  const watchedDepartureId = useWatch({ control: form.control, name: "departureId" })
  const watchedAdults = useWatch({ control: form.control, name: "adults" }) ?? 1
  const watchedChildren = useWatch({ control: form.control, name: "children" }) ?? 0
  const watchedChildrenAges = useWatch({ control: form.control, name: "childrenAges" }) ?? []
  const watchedCivicIdType = useWatch({ control: form.control, name: "traveler.civicIdType" })
  const watchedCivility = useWatch({ control: form.control, name: "traveler.civility" })

  const selectedDeparture = departures.find((d) => d.id === watchedDepartureId)
  const adultPrice = selectedDeparture?.adultPriceTnd ?? 0
  const childPrice = selectedDeparture?.childPriceTnd ?? adultPrice * 0.5
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

  async function onSubmit(data: PackageGuestBookingInput) {
    if (!acceptCgv) {
      setSubmitError("Vous devez accepter les conditions générales de vente.")
      return
    }
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      const result = await createGuestPackageBooking({ booking: data, paymentMethod: method })
      if (!result.ok) {
        setSubmitError(result.error)
        setIsSubmitting(false)
        return
      }
      router.push(`/booking/confirmation/${result.publicRef}?token=${result.guestAccessToken}`)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Erreur inconnue")
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
              <Calendar className="size-5" />
              Date de départ
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm font-medium">{packageTitle}</p>
            <Select value={watchedDepartureId} onValueChange={(v) => form.setValue("departureId", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Choisir une date" />
              </SelectTrigger>
              <SelectContent>
                {departures.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    <div className="flex items-center justify-between gap-4">
                      <span>{new Date(d.departureDate).toLocaleDateString("fr-FR")}</span>
                      <Badge variant={d.seatsLeft > 5 ? "default" : "destructive"}>{d.seatsLeft} places</Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.departureId ? (
              <p className="text-destructive text-sm">{form.formState.errors.departureId.message}</p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-5" />
              Voyageurs
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Adultes *</Label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  {...form.register("adults", { valueAsNumber: true })}
                />
                {form.formState.errors.adults ? (
                  <p className="text-destructive text-sm">{form.formState.errors.adults.message}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label>Enfants</Label>
                <Input
                  type="number"
                  min={0}
                  max={20}
                  value={watchedChildren}
                  onChange={(e) => setChildrenCount(Math.max(0, Number(e.target.value) || 0))}
                />
              </div>
            </div>
            {watchedChildren > 0 ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {Array.from({ length: watchedChildren }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Label>Âge enfant {i + 1}</Label>
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
            <CardTitle>Contact principal</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label>Civilité</Label>
                <Select
                  value={watchedCivility}
                  onValueChange={(v) => form.setValue("traveler.civility", v as "M" | "Mme" | "Mlle")}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="M">M.</SelectItem>
                    <SelectItem value="Mme">Mme</SelectItem>
                    <SelectItem value="Mlle">Mlle</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Prénom *</Label>
                <Input {...form.register("traveler.firstName")} className="mt-1" placeholder="Hassen" />
                {form.formState.errors.traveler?.firstName ? (
                  <p className="text-destructive mt-1 text-xs">{form.formState.errors.traveler.firstName.message}</p>
                ) : null}
              </div>
              <div>
                <Label>Nom *</Label>
                <Input {...form.register("traveler.lastName")} className="mt-1" placeholder="Tarhouni" />
                {form.formState.errors.traveler?.lastName ? (
                  <p className="text-destructive mt-1 text-xs">{form.formState.errors.traveler.lastName.message}</p>
                ) : null}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Email *</Label>
                <Input type="email" {...form.register("traveler.email")} className="mt-1" placeholder="vous@email.tn" />
                {form.formState.errors.traveler?.email ? (
                  <p className="text-destructive mt-1 text-xs">{form.formState.errors.traveler.email.message}</p>
                ) : null}
              </div>
              <div>
                <Label>Téléphone *</Label>
                <Input type="tel" {...form.register("traveler.phone")} className="mt-1" placeholder="+216 98 140 514" />
                {form.formState.errors.traveler?.phone ? (
                  <p className="text-destructive mt-1 text-xs">{form.formState.errors.traveler.phone.message}</p>
                ) : null}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label>Pièce d&apos;identité</Label>
                <Select
                  value={watchedCivicIdType}
                  onValueChange={(v) => form.setValue("traveler.civicIdType", v as "cin" | "passport")}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cin">CIN tunisienne</SelectItem>
                    <SelectItem value="passport">Passeport</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label>Numéro {watchedCivicIdType === "cin" ? "CIN" : "passeport"} *</Label>
                <Input {...form.register("traveler.civicId")} className="mt-1" placeholder="12345678" />
                {form.formState.errors.traveler?.civicId ? (
                  <p className="text-destructive mt-1 text-xs">{form.formState.errors.traveler.civicId.message}</p>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Mode de paiement</CardTitle>
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
              <Checkbox id="cgv-package" checked={acceptCgv} onCheckedChange={(v) => setAcceptCgv(Boolean(v))} />
              <Label htmlFor="cgv-package" className="text-muted-foreground text-sm leading-snug">
                J&apos;accepte les conditions générales de vente d&apos;Easy2Book.
              </Label>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-sidebar/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="size-5" />
              Récapitulatif
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm">Adultes × {watchedAdults}</span>
              <span className="font-medium">{(adultPrice * watchedAdults).toFixed(3)} DT</span>
            </div>
            {watchedChildren > 0 ? (
              <div className="flex items-center justify-between">
                <span className="text-sm">Enfants × {watchedChildren}</span>
                <span className="font-medium">{(childPrice * watchedChildren).toFixed(3)} DT</span>
              </div>
            ) : null}
            <Separator />
            <div className="flex items-center justify-between text-lg">
              <span className="font-semibold">Total TTC</span>
              <span className="font-bold text-violet-700">{totalPrice.toFixed(3)} DT</span>
            </div>
          </CardContent>
        </Card>

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={isSubmitting || !watchedDepartureId || !acceptCgv}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Traitement en cours…
            </>
          ) : (
            "Confirmer & payer"
          )}
        </Button>
      </form>
    </div>
  )
}
