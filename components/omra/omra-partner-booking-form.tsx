/**
 * OmraPartnerBookingForm — tunnel de réservation Omra B2B autorisé
 * (Phase 13.2, gap #1).
 *
 * Reprend exactement la structure de saisie pèlerin et le schéma Zod déjà
 * validés de `OmraGuestBookingForm` (Phase 12) — même champs, même
 * `omraGuestBookingSchema`/`omraPilgrimSchema` (lib/omra/schemas.ts),
 * aucune donnée pèlerin simplifiée ou fabriquée. Deux différences avec le
 * B2C, correspondant exactement au chemin B2B déjà utilisé par
 * `OmraBookingForm`/`/pro/sandbox` :
 *   - pas de sélection de mode de règlement (le montant est toujours
 *     débité du compte de dépôt de l'agence, jamais de carte/virement/
 *     espèces à choisir) ;
 *   - soumet à `createOmraBooking` (session partenaire + débit wallet),
 *     pas à `createGuestOmraBooking`.
 *
 * Le package et les départs proviennent des vraies données autorisées
 * (`/pro/produits/omra/[id]`, RLS élargie 0023_commerce_completion.sql) —
 * jamais des `MOCK_PACKAGES`/`MOCK_ALLOTMENTS` que `/pro/sandbox` continue
 * d'utiliser pour la démo (page non touchée, hors périmètre).
 */

"use client"

import { useState } from "react"
import { useForm, useFieldArray, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, Plus, Trash2, User, Calendar, Wallet } from "lucide-react"
import { createOmraBooking } from "@/lib/omra/booking-actions"
import { omraGuestBookingSchema, type OmraGuestBookingInput } from "@/lib/omra/schemas"

interface DepartureOption {
  departureDate: string
  availableCount: number
  price: number
}

interface OmraPartnerBookingFormProps {
  packageId: string
  packageName: string
  basePrice: number
  durationDays: number
  departures: DepartureOption[]
  defaultDepartureDate?: string
}

const emptyPilgrim = {
  firstName: "",
  lastName: "",
  birthDate: "",
  nationality: "TN",
  gender: "male" as const,
  maritalStatus: "single" as const,
  phone: "",
  country: "TN",
  passportNumber: "",
  passportIssueDate: "",
  passportExpiryDate: "",
  passportIssuingCountry: "TN",
  hasMedicalConditions: false,
  requiresSpecialAssistance: false,
}

export function OmraPartnerBookingForm({
  packageId,
  packageName,
  basePrice,
  durationDays,
  departures,
  defaultDepartureDate,
}: OmraPartnerBookingFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ publicRef: string } | null>(null)

  const form = useForm<OmraGuestBookingInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(omraGuestBookingSchema) as any,
    defaultValues: {
      packageId,
      departureDate: defaultDepartureDate ?? departures[0]?.departureDate ?? "",
      pilgrims: [emptyPilgrim],
    },
  })

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "pilgrims" })
  const watchedDepartureDate = useWatch({ control: form.control, name: "departureDate" })
  const watchedPilgrims = useWatch({ control: form.control, name: "pilgrims" })

  const selectedDeparture = departures.find((d) => d.departureDate === watchedDepartureDate)
  const pricePerPilgrim = selectedDeparture?.price ?? basePrice
  const totalPrice = pricePerPilgrim * watchedPilgrims.length

  async function onSubmit(data: OmraGuestBookingInput) {
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      const result = await createOmraBooking({
        packageId: data.packageId,
        departureDate: data.departureDate,
        pilgrims: data.pilgrims,
      })
      if (!result.ok) {
        setSubmitError(result.error)
        setIsSubmitting(false)
        return
      }
      setSuccess({ publicRef: result.publicRef })
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Erreur inconnue")
      setIsSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="rounded-lg bg-emerald-50 p-6 text-sm text-emerald-800">
        <p className="font-semibold">Réservation confirmée</p>
        <p className="mt-1">
          Référence <span className="font-semibold">{success.publicRef}</span> — le montant a été
          débité de votre compte de dépôt. Facture et voucher disponibles depuis{" "}
          <a href="/pro/factures" className="underline">
            Factures
          </a>
          .
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {submitError ? (
        <Alert variant="destructive" className="rounded-lg">
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      ) : null}

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Départ */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="size-5" />
              Date de départ
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm font-medium">{packageName}</p>
            <p className="text-muted-foreground text-xs">{durationDays} jours</p>
            <Select
              value={watchedDepartureDate}
              onValueChange={(v) => form.setValue("departureDate", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choisir une date" />
              </SelectTrigger>
              <SelectContent>
                {departures.map((d) => (
                  <SelectItem key={d.departureDate} value={d.departureDate}>
                    <div className="flex items-center justify-between gap-4">
                      <span>{new Date(d.departureDate).toLocaleDateString("fr-FR")}</span>
                      <Badge variant={d.availableCount > 10 ? "default" : "destructive"}>
                        {d.availableCount} places
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.departureDate ? (
              <p className="text-destructive text-sm">{form.formState.errors.departureDate.message}</p>
            ) : null}
          </CardContent>
        </Card>

        {/* Pèlerins */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <User className="size-5" />
                Fiches pèlerins ({watchedPilgrims.length})
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append(emptyPilgrim)}
                disabled={watchedPilgrims.length >= 100}
              >
                <Plus className="mr-1 size-4" />
                Ajouter un pèlerin
              </Button>
            </CardTitle>
            <CardDescription>Informations requises pour le visa et la réservation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {fields.map((field, index) => (
              <div key={field.id} className="relative space-y-4 rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Pèlerin #{index + 1}</h3>
                  {fields.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  ) : null}
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Prénom *" error={form.formState.errors.pilgrims?.[index]?.firstName?.message}>
                    <Input {...form.register(`pilgrims.${index}.firstName`)} placeholder="Ahmed" />
                  </Field>
                  <Field label="Nom *" error={form.formState.errors.pilgrims?.[index]?.lastName?.message}>
                    <Input {...form.register(`pilgrims.${index}.lastName`)} placeholder="Ben Ali" />
                  </Field>
                  <Field label="Date de naissance *" error={form.formState.errors.pilgrims?.[index]?.birthDate?.message}>
                    <Input type="date" {...form.register(`pilgrims.${index}.birthDate`)} />
                  </Field>
                </div>

                <Separator />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Nationalité *" error={form.formState.errors.pilgrims?.[index]?.nationality?.message}>
                    <Input {...form.register(`pilgrims.${index}.nationality`)} placeholder="TN" maxLength={2} />
                  </Field>
                  <div className="space-y-2">
                    <Label>Genre *</Label>
                    <Select
                      value={watchedPilgrims[index]?.gender}
                      onValueChange={(v) => form.setValue(`pilgrims.${index}.gender`, v as "male" | "female")}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">Homme</SelectItem>
                        <SelectItem value="female">Femme</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Situation matrimoniale *</Label>
                    <Select
                      value={watchedPilgrims[index]?.maritalStatus}
                      onValueChange={(v) =>
                        form.setValue(`pilgrims.${index}.maritalStatus`, v as "single" | "married" | "widowed" | "divorced")
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="single">Célibataire</SelectItem>
                        <SelectItem value="married">Marié(e)</SelectItem>
                        <SelectItem value="widowed">Veuf/Veuve</SelectItem>
                        <SelectItem value="divorced">Divorcé(e)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Separator />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Téléphone *" error={form.formState.errors.pilgrims?.[index]?.phone?.message}>
                    <Input {...form.register(`pilgrims.${index}.phone`)} placeholder="+216 98 123 456" />
                  </Field>
                  <Field
                    label={index === 0 ? "Email * (contact du groupe)" : "Email"}
                    error={form.formState.errors.pilgrims?.[index]?.email?.message}
                  >
                    <Input type="email" {...form.register(`pilgrims.${index}.email`)} placeholder="email@example.com" />
                  </Field>
                </div>

                <Separator />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Field
                    label="Numéro de passeport *"
                    error={form.formState.errors.pilgrims?.[index]?.passportNumber?.message}
                  >
                    <Input {...form.register(`pilgrims.${index}.passportNumber`)} placeholder="A12345678" />
                  </Field>
                  <Field
                    label="Pays émetteur *"
                    error={form.formState.errors.pilgrims?.[index]?.passportIssuingCountry?.message}
                  >
                    <Input {...form.register(`pilgrims.${index}.passportIssuingCountry`)} placeholder="TN" maxLength={2} />
                  </Field>
                  <Field
                    label="Date d'émission *"
                    error={form.formState.errors.pilgrims?.[index]?.passportIssueDate?.message}
                  >
                    <Input type="date" {...form.register(`pilgrims.${index}.passportIssueDate`)} />
                  </Field>
                  <Field
                    label="Date d'expiration *"
                    error={form.formState.errors.pilgrims?.[index]?.passportExpiryDate?.message}
                  >
                    <Input type="date" {...form.register(`pilgrims.${index}.passportExpiryDate`)} />
                  </Field>
                </div>

                <div className="space-y-2">
                  <Label>Type de chambre</Label>
                  <Select
                    value={watchedPilgrims[index]?.roomType}
                    onValueChange={(v) =>
                      form.setValue(`pilgrims.${index}.roomType`, v as "single" | "double" | "triple" | "quad" | "suite")
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choisir" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="single">Single</SelectItem>
                      <SelectItem value="double">Double</SelectItem>
                      <SelectItem value="triple">Triple</SelectItem>
                      <SelectItem value="quad">Quadruple</SelectItem>
                      <SelectItem value="suite">Suite</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Récapitulatif */}
        <Card className="bg-sidebar/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="size-5" />
              Récapitulatif — débit compte de dépôt
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm">Nombre de pèlerins</span>
              <Badge variant="secondary">{watchedPilgrims.length}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Prix par pèlerin</span>
              <span className="font-semibold">{pricePerPilgrim.toFixed(3)} DT</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between text-lg">
              <span className="font-semibold">Total à débiter</span>
              <span className="font-bold text-emerald-700">{totalPrice.toFixed(3)} DT</span>
            </div>
          </CardContent>
        </Card>

        <Button type="submit" size="lg" className="w-full" disabled={isSubmitting || !watchedDepartureDate}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Traitement en cours…
            </>
          ) : (
            "Confirmer la réservation (débit compte de dépôt)"
          )}
        </Button>
      </form>
    </div>
  )
}

function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
    </div>
  )
}
