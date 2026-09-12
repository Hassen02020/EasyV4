/**
 * OmraGuestBookingForm — tunnel de réservation Omra B2C (Phase 12, Partie 7).
 *
 * Reprend la structure de saisie pèlerin déjà validée dans
 * `omra-booking-form.tsx` (mêmes champs, même validation), mais :
 *   - reçoit le package et les départs RÉELS en props (plus de MOCK_*),
 *   - soumet à `createGuestOmraBooking` (guest checkout, pas de session
 *     partenaire, pas de débit wallet),
 *   - ajoute la sélection du mode de règlement (carte / virement / espèces),
 *     même modèle que `components/booking/checkout-form.tsx`,
 *   - redirige vers la page de confirmation générique du tunnel
 *     (`/booking/confirmation/[ref]`) au lieu d'un état de succès local.
 */

"use client"

import { useState } from "react"
import { useRouter } from "@/i18n/navigation"
import { useTranslations } from "next-intl"
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
import { Checkbox } from "@/components/ui/checkbox"
import {
  Loader2,
  Plus,
  Trash2,
  User,
  Calendar,
  CreditCard,
  Banknote,
  Wallet,
} from "lucide-react"
import { createGuestOmraBooking } from "@/lib/omra/guest-booking-actions"
import { omraGuestBookingSchema, type OmraGuestBookingInput } from "@/lib/omra/schemas"
import type { GuestPaymentMethod } from "@/lib/booking/guest-actions"
import { CancellationPolicyDisplay } from "@/components/booking/cancellation-policy-display"
import type { ResolvedPolicy } from "@/lib/booking/policy-engine"

interface DepartureOption {
  departureDate: string
  availableCount: number
  price: number
}

interface OmraGuestBookingFormProps {
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

function getMethods(
  t: ReturnType<typeof useTranslations>,
): { key: GuestPaymentMethod; label: string; desc: string; icon: typeof CreditCard }[] {
  return [
    { key: "card", label: t("paymentCardLabel"), desc: t("paymentCardDesc"), icon: CreditCard },
    { key: "transfer", label: t("paymentTransferLabel"), desc: t("paymentTransferDesc"), icon: Banknote },
    { key: "cash", label: t("paymentCashLabel"), desc: t("paymentCashDesc"), icon: Wallet },
  ]
}

export function OmraGuestBookingForm({
  packageId,
  packageName,
  basePrice,
  durationDays,
  departures,
  defaultDepartureDate,
}: OmraGuestBookingFormProps) {
  const router = useRouter()
  const t = useTranslations("Omra")
  const METHODS = getMethods(t)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [method, setMethod] = useState<GuestPaymentMethod>("card")
  const [acceptCgv, setAcceptCgv] = useState(false)
  const [policyAccepted, setPolicyAccepted] = useState(false)
  const [resolvedPolicy, setResolvedPolicy] = useState<ResolvedPolicy | null | undefined>(undefined)

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

  // La case d'acceptation n'est exigée que si une politique réelle a été
  // résolue pour ce package — aucune politique publiée n'est jamais
  // bloquante (voir components/booking/cancellation-policy-display.tsx).
  const policyAcceptanceRequired = resolvedPolicy != null && !policyAccepted

  async function onSubmit(data: OmraGuestBookingInput) {
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
      const result = await createGuestOmraBooking({
        booking: { ...data, policyAccepted },
        paymentMethod: method,
      })
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
        {/* Départ */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="size-5" />
              {t("departureDateTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm font-medium">{packageName}</p>
            <p className="text-muted-foreground text-xs">{t("daysCount", { days: durationDays })}</p>
            <Select
              value={watchedDepartureDate}
              onValueChange={(v) => form.setValue("departureDate", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("chooseDate")} />
              </SelectTrigger>
              <SelectContent>
                {departures.map((d) => (
                  <SelectItem key={d.departureDate} value={d.departureDate}>
                    <div className="flex items-center justify-between gap-4">
                      <span>{new Date(d.departureDate).toLocaleDateString("fr-FR")}</span>
                      <Badge variant={d.availableCount > 10 ? "default" : "destructive"}>
                        {t("seatsAvailable", { count: d.availableCount })}
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
                {t("pilgrimFilesTitle", { count: watchedPilgrims.length })}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append(emptyPilgrim)}
                disabled={watchedPilgrims.length >= 100}
              >
                <Plus className="mr-1 size-4" />
                {t("addPilgrim")}
              </Button>
            </CardTitle>
            <CardDescription>{t("pilgrimInfoDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {fields.map((field, index) => (
              <div key={field.id} className="relative space-y-4 rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{t("pilgrimNumber", { n: index + 1 })}</h3>
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
                  <Field label={t("firstNameLabel")} error={form.formState.errors.pilgrims?.[index]?.firstName?.message}>
                    <Input {...form.register(`pilgrims.${index}.firstName`)} placeholder="Ahmed" />
                  </Field>
                  <Field label={t("lastNameLabel")} error={form.formState.errors.pilgrims?.[index]?.lastName?.message}>
                    <Input {...form.register(`pilgrims.${index}.lastName`)} placeholder="Ben Ali" />
                  </Field>
                  <Field label={t("birthDateLabel")} error={form.formState.errors.pilgrims?.[index]?.birthDate?.message}>
                    <Input type="date" {...form.register(`pilgrims.${index}.birthDate`)} />
                  </Field>
                </div>

                <Separator />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label={t("nationalityLabel")} error={form.formState.errors.pilgrims?.[index]?.nationality?.message}>
                    <Input {...form.register(`pilgrims.${index}.nationality`)} placeholder="TN" maxLength={2} />
                  </Field>
                  <div className="space-y-2">
                    <Label>{t("genderLabel")}</Label>
                    <Select
                      value={watchedPilgrims[index]?.gender}
                      onValueChange={(v) => form.setValue(`pilgrims.${index}.gender`, v as "male" | "female")}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">{t("gender.male")}</SelectItem>
                        <SelectItem value="female">{t("gender.female")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("maritalStatusLabel")}</Label>
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
                        <SelectItem value="single">{t("maritalStatus.single")}</SelectItem>
                        <SelectItem value="married">{t("maritalStatus.married")}</SelectItem>
                        <SelectItem value="widowed">{t("maritalStatus.widowed")}</SelectItem>
                        <SelectItem value="divorced">{t("maritalStatus.divorced")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Separator />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label={t("phoneLabel")} error={form.formState.errors.pilgrims?.[index]?.phone?.message}>
                    <Input {...form.register(`pilgrims.${index}.phone`)} placeholder="+216 98 123 456" />
                  </Field>
                  <Field
                    label={index === 0 ? t("emailGroupLabel") : t("emailLabel")}
                    error={form.formState.errors.pilgrims?.[index]?.email?.message}
                  >
                    <Input type="email" {...form.register(`pilgrims.${index}.email`)} placeholder="email@example.com" />
                  </Field>
                </div>

                <Separator />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Field
                    label={t("passportNumberLabel")}
                    error={form.formState.errors.pilgrims?.[index]?.passportNumber?.message}
                  >
                    <Input {...form.register(`pilgrims.${index}.passportNumber`)} placeholder="A12345678" />
                  </Field>
                  <Field
                    label={t("passportIssuingCountryLabel")}
                    error={form.formState.errors.pilgrims?.[index]?.passportIssuingCountry?.message}
                  >
                    <Input {...form.register(`pilgrims.${index}.passportIssuingCountry`)} placeholder="TN" maxLength={2} />
                  </Field>
                  <Field
                    label={t("passportIssueDateLabel")}
                    error={form.formState.errors.pilgrims?.[index]?.passportIssueDate?.message}
                  >
                    <Input type="date" {...form.register(`pilgrims.${index}.passportIssueDate`)} />
                  </Field>
                  <Field
                    label={t("passportExpiryDateLabel")}
                    error={form.formState.errors.pilgrims?.[index]?.passportExpiryDate?.message}
                  >
                    <Input type="date" {...form.register(`pilgrims.${index}.passportExpiryDate`)} />
                  </Field>
                </div>

                <div className="space-y-2">
                  <Label>{t("roomTypeLabel")}</Label>
                  <Select
                    value={watchedPilgrims[index]?.roomType}
                    onValueChange={(v) =>
                      form.setValue(`pilgrims.${index}.roomType`, v as "single" | "double" | "triple" | "quad" | "suite")
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("chooseRoomType")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="single">{t("roomType.single")}</SelectItem>
                      <SelectItem value="double">{t("roomType.double")}</SelectItem>
                      <SelectItem value="triple">{t("roomType.triple")}</SelectItem>
                      <SelectItem value="quad">{t("roomType.quad")}</SelectItem>
                      <SelectItem value="suite">{t("roomType.suite")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Politique d'annulation */}
        <CancellationPolicyDisplay
          productType="omra"
          productId={packageId}
          accepted={policyAccepted}
          onAcceptedChange={setPolicyAccepted}
          onPolicyResolved={setResolvedPolicy}
        />

        {/* Règlement */}
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
              <Checkbox id="cgv-omra" checked={acceptCgv} onCheckedChange={(v) => setAcceptCgv(Boolean(v))} />
              <Label htmlFor="cgv-omra" className="text-muted-foreground text-sm leading-snug">
                {t("acceptCgv")}
              </Label>
            </div>
          </CardContent>
        </Card>

        {/* Récapitulatif */}
        <Card className="bg-sidebar/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="size-5" />
              {t("summaryTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm">{t("pilgrimsCountLabel")}</span>
              <Badge variant="secondary">{watchedPilgrims.length}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">{t("pricePerPilgrim")}</span>
              <span className="font-semibold">{pricePerPilgrim.toFixed(3)} DT</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between text-lg">
              <span className="font-semibold">{t("totalTtc")}</span>
              <span className="font-bold text-emerald-700">{totalPrice.toFixed(3)} DT</span>
            </div>
          </CardContent>
        </Card>

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={isSubmitting || !watchedDepartureDate || !acceptCgv || policyAcceptanceRequired}
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
