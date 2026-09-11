/**
 * FlightGuestBookingForm — tunnel de réservation Vols B2C.
 *
 * Même patron que `components/packages/package-guest-booking-form.tsx` /
 * Omra : une seule page, contact voyageur + mode de règlement, pas le
 * tunnel générique `/booking/*` (spécifique Hôtel). Un formulaire
 * "Voyageur #n" par passager (adultes + enfants, décompte figé dès la
 * recherche — voir `lib/vols/virtual-supplier/engine.ts::search()`).
 *
 * `offerToken`/`expectedPriceTnd` ne sont jamais modifiables ici : revalidés
 * côté serveur par `lib/vols/virtual-supplier/engine.ts::book()`
 * (`lib/vols/guest-booking-actions.ts`) — cette page affiche seulement ce
 * que la recherche a renvoyé, jamais une source de vérité prix/disponibilité.
 */

"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Checkbox } from "@/components/ui/checkbox"
import { Loader2, User, CreditCard, Banknote, Wallet, Plane } from "lucide-react"
import { createGuestFlightBooking, type FlightGuestPaymentMethod } from "@/lib/vols/guest-booking-actions"
import { flightGuestBookingSchema, type FlightGuestBookingInput } from "@/lib/vols/schemas"

export interface FlightBookingOfferSummary {
  offerToken: string
  priceTnd: number
  currency: string
  origin: string
  destination: string
  departureAt: string
  arrivalAt: string
  carrier: string
  flightNumber: string
  stops: number
  cabin: string
  adults: number
  children: number
  refundable: boolean
  baggageKg: number | null
}

const METHODS: { key: FlightGuestPaymentMethod; label: string; desc: string; icon: typeof CreditCard }[] = [
  { key: "card", label: "Carte bancaire", desc: "Paiement en ligne immédiat", icon: CreditCard },
  {
    key: "transfer",
    label: "Virement bancaire",
    desc: "Coordonnées de virement envoyées par email — billet émis après confirmation du règlement",
    icon: Banknote,
  },
  {
    key: "cash",
    label: "Espèces en agence",
    desc: "Réservation maintenue en attente de paiement — billet émis après confirmation du règlement",
    icon: Wallet,
  },
]

function emptyTraveler() {
  return {
    firstName: "",
    lastName: "",
    birthDate: "",
    gender: "male" as const,
    nationality: "",
    passportNumber: "",
    email: "",
    phone: "",
  }
}

export function FlightGuestBookingForm({ offer }: { offer: FlightBookingOfferSummary }) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [method, setMethod] = useState<FlightGuestPaymentMethod>("card")
  const [acceptCgv, setAcceptCgv] = useState(false)

  const paxCount = Math.max(1, offer.adults + offer.children)

  const form = useForm<FlightGuestBookingInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(flightGuestBookingSchema) as any,
    defaultValues: {
      offerToken: offer.offerToken,
      expectedPriceTnd: offer.priceTnd,
      travelers: Array.from({ length: paxCount }, () => emptyTraveler()),
    },
  })

  const { fields } = useFieldArray({ control: form.control, name: "travelers" })

  async function onSubmit(data: FlightGuestBookingInput) {
    if (!acceptCgv) {
      setSubmitError("Vous devez accepter les conditions générales de vente.")
      return
    }
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      const result = await createGuestFlightBooking({ booking: data, paymentMethod: method })
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
              <Plane className="size-5" />
              Votre vol
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">
                {offer.origin} → {offer.destination}
              </span>
              <span className="text-muted-foreground">
                {offer.carrier} {offer.flightNumber}
              </span>
            </div>
            <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
              <span>{new Date(offer.departureAt).toLocaleString("fr-FR")}</span>
              <span>{offer.stops === 0 ? "Vol direct" : `${offer.stops} escale${offer.stops > 1 ? "s" : ""}`}</span>
              <span>{offer.cabin}</span>
              {offer.refundable ? <span>Remboursable</span> : null}
            </div>
          </CardContent>
        </Card>

        {fields.map((field, index) => (
          <Card key={field.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <User className="size-4" />
                Voyageur #{index + 1}
                {index === 0 ? <span className="text-muted-foreground text-xs font-normal">(contact principal)</span> : null}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Prénom *</Label>
                  <Input {...form.register(`travelers.${index}.firstName`)} className="mt-1" />
                  {form.formState.errors.travelers?.[index]?.firstName ? (
                    <p className="text-destructive mt-1 text-xs">
                      {form.formState.errors.travelers[index]?.firstName?.message}
                    </p>
                  ) : null}
                </div>
                <div>
                  <Label>Nom *</Label>
                  <Input {...form.register(`travelers.${index}.lastName`)} className="mt-1" />
                  {form.formState.errors.travelers?.[index]?.lastName ? (
                    <p className="text-destructive mt-1 text-xs">
                      {form.formState.errors.travelers[index]?.lastName?.message}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label>Date de naissance *</Label>
                  <Input type="date" {...form.register(`travelers.${index}.birthDate`)} className="mt-1" />
                  {form.formState.errors.travelers?.[index]?.birthDate ? (
                    <p className="text-destructive mt-1 text-xs">
                      {form.formState.errors.travelers[index]?.birthDate?.message}
                    </p>
                  ) : null}
                </div>
                <div>
                  <Label>Genre</Label>
                  <Select
                    value={form.watch(`travelers.${index}.gender`)}
                    onValueChange={(v) => form.setValue(`travelers.${index}.gender`, v as "male" | "female")}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Homme</SelectItem>
                      <SelectItem value="female">Femme</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Nationalité *</Label>
                  <Input
                    {...form.register(`travelers.${index}.nationality`)}
                    className="mt-1 uppercase"
                    placeholder="TN"
                    maxLength={2}
                  />
                  {form.formState.errors.travelers?.[index]?.nationality ? (
                    <p className="text-destructive mt-1 text-xs">
                      {form.formState.errors.travelers[index]?.nationality?.message}
                    </p>
                  ) : null}
                </div>
              </div>
              <div>
                <Label>Numéro de passeport / CIN *</Label>
                <Input {...form.register(`travelers.${index}.passportNumber`)} className="mt-1" />
                {form.formState.errors.travelers?.[index]?.passportNumber ? (
                  <p className="text-destructive mt-1 text-xs">
                    {form.formState.errors.travelers[index]?.passportNumber?.message}
                  </p>
                ) : null}
              </div>
              {index === 0 ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Email *</Label>
                    <Input type="email" {...form.register(`travelers.${index}.email`)} className="mt-1" />
                    {form.formState.errors.travelers?.[index]?.email ? (
                      <p className="text-destructive mt-1 text-xs">
                        {form.formState.errors.travelers[index]?.email?.message}
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <Label>Téléphone</Label>
                    <Input type="tel" {...form.register(`travelers.${index}.phone`)} className="mt-1" placeholder="+216 98 140 514" />
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))}

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
              <Checkbox id="cgv-flight" checked={acceptCgv} onCheckedChange={(v) => setAcceptCgv(Boolean(v))} />
              <Label htmlFor="cgv-flight" className="text-muted-foreground text-sm leading-snug">
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
              <span className="text-sm">
                {paxCount} passager{paxCount > 1 ? "s" : ""}
              </span>
              <span className="font-medium">
                {offer.priceTnd.toLocaleString("fr-FR")} {offer.currency}
              </span>
            </div>
            <Separator />
            <div className="flex items-center justify-between text-lg">
              <span className="font-semibold">Total TTC</span>
              <span className="font-bold text-violet-700">
                {offer.priceTnd.toLocaleString("fr-FR")} {offer.currency}
              </span>
            </div>
          </CardContent>
        </Card>

        <Button type="submit" size="lg" className="w-full" disabled={isSubmitting || !acceptCgv}>
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
