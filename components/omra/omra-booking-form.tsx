/**
 * OmraBookingForm — Composant client pour réservation Omra de groupe
 *
 * Fonctionnalités :
 *   - Sélection du package Omra et date de départ
 *   - Saisie dynamique des fiches pèlerins (ajout/suppression)
 *   - Validation react-hook-form + Zod
 *   - Calcul du prix total en temps réel
 *   - Soumission via Server Action createOmraBooking
 */

"use client"

import { useState } from "react"
import { useForm, useFieldArray, useWatch } from "react-hook-form"
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
import { Loader2, Plus, Trash2, User, MapPin, Calendar, CreditCard } from "lucide-react"
import { createOmraBooking, type OmraPilgrimInput } from "@/lib/omra/booking-actions"

/* -------------------------------------------------------------------------- */
/* Zod Schema                                                                 */
/* -------------------------------------------------------------------------- */

const pilgrimSchema = z.object({
  firstName: z.string().min(2, "Prénom requis (min 2 caractères)"),
  lastName: z.string().min(2, "Nom requis (min 2 caractères)"),
  firstNameAr: z.string().optional(),
  lastNameAr: z.string().optional(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format date invalide (YYYY-MM-DD)"),
  birthPlace: z.string().optional(),
  nationality: z.string().length(2, "Code pays requis (ex: TN)"),
  gender: z.enum(["male", "female"]),
  maritalStatus: z.enum(["single", "married", "widowed", "divorced"]),
  phone: z.string().min(8, "Numéro de téléphone invalide"),
  email: z.string().email("Email invalide").optional().or(z.literal("")),
  address: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().length(2, "Code pays de résidence requis (ex: TN)"),
  passportNumber: z.string().min(6, "Numéro passeport requis"),
  passportIssueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format date invalide"),
  passportExpiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format date invalide"),
  passportIssuingCountry: z.string().length(2, "Code pays émetteur requis"),
  bloodType: z.string().optional(),
  hasMedicalConditions: z.boolean().default(false),
  medicalConditions: z.string().optional(),
  requiresSpecialAssistance: z.boolean().default(false),
  specialAssistanceDetails: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  emergencyContactRelation: z.string().optional(),
  roomType: z.enum(["single", "double", "triple", "quad", "suite"]).optional(),
  photoUrl: z.string().url().optional().or(z.literal("")),
  passportScanUrl: z.string().url().optional().or(z.literal("")),
})

const omraBookingSchema = z.object({
  packageId: z.string().uuid("Package invalide"),
  departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format date invalide"),
  pilgrims: z.array(pilgrimSchema).min(1, "Au moins un pèlerin requis").max(100, "Maximum 100 pèlerins"),
})

type OmraBookingFormData = z.infer<typeof omraBookingSchema>

/* -------------------------------------------------------------------------- */
/* Mock Data (à remplacer par API réelle)                                    */
/* -------------------------------------------------------------------------- */

const MOCK_PACKAGES = [
  { id: "pkg-001", name: "Omra Ramadan 2026 - 10 jours", basePrice: 2500, durationDays: 10 },
  { id: "pkg-002", name: "Omra Économique - 7 jours", basePrice: 1800, durationDays: 7 },
  { id: "pkg-003", name: "Omra Confort - 12 jours", basePrice: 3200, durationDays: 12 },
]

const MOCK_ALLOTMENTS = [
  { packageId: "pkg-001", departureDate: "2026-03-01", availableCount: 25, price: 2500 },
  { packageId: "pkg-001", departureDate: "2026-03-08", availableCount: 18, price: 2500 },
  { packageId: "pkg-001", departureDate: "2026-03-15", availableCount: 42, price: 2500 },
  { packageId: "pkg-002", departureDate: "2026-04-01", availableCount: 30, price: 1800 },
  { packageId: "pkg-003", departureDate: "2026-05-01", availableCount: 15, price: 3200 },
]

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export function OmraBookingForm() {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitSuccess, setSubmitSuccess] = useState<{ reservationId: string; publicRef: string } | null>(null)

  const form = useForm<OmraBookingFormData>({
    resolver: zodResolver(omraBookingSchema),
    defaultValues: {
      packageId: "",
      departureDate: "",
      pilgrims: [
        {
          firstName: "",
          lastName: "",
          birthDate: "",
          nationality: "TN",
          gender: "male",
          maritalStatus: "single",
          phone: "",
          country: "TN",
          passportNumber: "",
          passportIssueDate: "",
          passportExpiryDate: "",
          passportIssuingCountry: "TN",
          hasMedicalConditions: false,
          requiresSpecialAssistance: false,
        },
      ],
    },
  })

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "pilgrims",
  })

  const watchedPackageId = useWatch({ control: form.control, name: "packageId" })
  const watchedDepartureDate = useWatch({ control: form.control, name: "departureDate" })
  const watchedPilgrims = useWatch({ control: form.control, name: "pilgrims" })

  // Calcul du prix total
  const selectedPackage = MOCK_PACKAGES.find((p) => p.id === watchedPackageId)
  const selectedAllotment = MOCK_ALLOTMENTS.find(
    (a) => a.packageId === watchedPackageId && a.departureDate === watchedDepartureDate,
  )
  const pricePerPilgrim = selectedAllotment?.price ?? selectedPackage?.basePrice ?? 0
  const totalPrice = pricePerPilgrim * watchedPilgrims.length

  const onSubmit = async (data: OmraBookingFormData) => {
    setIsSubmitting(true)
    setSubmitError(null)
    setSubmitSuccess(null)

    try {
      const result = await createOmraBooking({
        agencyId: "00000000-0000-0000-0000-000000000001", // TODO: depuis session
        packageId: data.packageId,
        departureDate: data.departureDate,
        pilgrims: data.pilgrims as OmraPilgrimInput[],
        createdByUserId: undefined, // TODO: depuis session
      })

      if (!result.ok) {
        setSubmitError(result.error)
      } else {
        setSubmitSuccess({ reservationId: result.reservationId, publicRef: result.publicRef })
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
            <User className="w-6 h-6" />
            Réservation Confirmée
          </CardTitle>
          <CardDescription className="text-green-600">
            Votre réservation Omra a été enregistrée avec succès.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4">
            <p className="text-sm font-medium text-green-700">N° Réservation</p>
            <p className="text-2xl font-bold text-green-700">{submitSuccess.publicRef}</p>
          </div>
          <Button onClick={() => window.location.reload()} className="w-full bg-green-600 hover:bg-green-700 text-white rounded-lg">
            Nouvelle Réservation
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold text-[#1e3a8a]">Réservation Omra de Groupe</h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Sélectionnez un package, une date de départ et saisissez les fiches pèlerins.
        </p>
      </div>

      {submitError && (
        <Alert variant="destructive" className="rounded-lg">
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Package Selection */}
        <Card className="rounded-lg border-2 border-[#1e3a8a]/10">
          <CardHeader className="bg-[#1e3a8a]/5 rounded-t-lg">
            <CardTitle className="flex items-center gap-2 text-[#1e3a8a]">
              <MapPin className="w-5 h-5" />
              Sélection du Package
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="packageId">Package Omra</Label>
                <Select
                  value={watchedPackageId}
                  onValueChange={(v) => form.setValue("packageId", v)}
                >
                  <SelectTrigger id="packageId">
                    <SelectValue placeholder="Choisir un package" />
                  </SelectTrigger>
                  <SelectContent>
                    {MOCK_PACKAGES.map((pkg) => (
                      <SelectItem key={pkg.id} value={pkg.id}>
                        {pkg.name} — {pkg.basePrice} DT/pèlerin
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="departureDate">Date de départ</Label>
                <Select
                  value={watchedDepartureDate}
                  onValueChange={(v) => form.setValue("departureDate", v)}
                  disabled={!watchedPackageId}
                >
                  <SelectTrigger id="departureDate">
                    <SelectValue placeholder="Choisir une date" />
                  </SelectTrigger>
                  <SelectContent>
                    {MOCK_ALLOTMENTS
                      .filter((a) => a.packageId === watchedPackageId)
                      .map((allotment) => (
                        <SelectItem key={allotment.departureDate} value={allotment.departureDate}>
                          <div className="flex items-center justify-between gap-4">
                            <span>{new Date(allotment.departureDate).toLocaleDateString("fr-FR")}</span>
                            <Badge variant={allotment.availableCount > 10 ? "default" : "destructive"}>
                              {allotment.availableCount} places
                            </Badge>
                          </div>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {selectedPackage && (
              <div className="bg-[#1e3a8a]/5 border border-[#1e3a8a]/20 rounded-lg p-4 text-sm">
                <p className="text-[#1e3a8a] font-semibold">Durée : {selectedPackage.durationDays} jours</p>
                <p className="text-[#1e3a8a] font-semibold">Prix de base : {selectedPackage.basePrice} DT/pèlerin</p>
                {selectedAllotment && (
                  <p className={selectedAllotment.availableCount > 10 ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>
                    Disponibilité : {selectedAllotment.availableCount} places
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pilgrims List */}
        <Card className="rounded-lg border-2 border-[#1e3a8a]/10">
          <CardHeader className="bg-[#1e3a8a]/5 rounded-t-lg">
            <CardTitle className="flex items-center justify-between text-[#1e3a8a]">
              <div className="flex items-center gap-2">
                <User className="w-5 h-5" />
                <span className="text-lg sm:text-xl">Fiches Pèlerins ({watchedPilgrims.length})</span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-[#f59e0b] text-[#f59e0b] hover:bg-[#f59e0b] hover:text-white rounded-lg"
                onClick={() =>
                  append({
                    firstName: "",
                    lastName: "",
                    birthDate: "",
                    nationality: "TN",
                    gender: "male",
                    maritalStatus: "single",
                    phone: "",
                    country: "TN",
                    passportNumber: "",
                    passportIssueDate: "",
                    passportExpiryDate: "",
                    passportIssuingCountry: "TN",
                    hasMedicalConditions: false,
                    requiresSpecialAssistance: false,
                  })
                }
                disabled={watchedPilgrims.length >= 100}
              >
                <Plus className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">Ajouter un pèlerin</span>
                <span className="sm:hidden">Ajouter</span>
              </Button>
            </CardTitle>
            <CardDescription className="text-sm">
              Informations requises pour le visa et la réservation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            {fields.map((field, index) => (
              <div key={field.id} className="space-y-4 p-4 sm:p-6 border-2 border-[#1e3a8a]/10 rounded-lg relative bg-white">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-[#1e3a8a] text-lg">Pèlerin #{index + 1}</h3>
                  {fields.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg"
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-[#1e3a8a]">Prénom *</Label>
                    <Input
                      {...form.register(`pilgrims.${index}.firstName`)}
                      placeholder="Ahmed"
                      className={form.formState.errors.pilgrims?.[index]?.firstName ? "border-red-500 focus-visible:ring-red-500 rounded-lg" : "rounded-lg"}
                    />
                    {form.formState.errors.pilgrims?.[index]?.firstName && (
                      <p className="text-sm text-red-500 font-medium animate-in fade-in slide-in-from-top-1 duration-200">
                        {form.formState.errors.pilgrims[index]?.firstName?.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-[#1e3a8a]">Nom *</Label>
                    <Input
                      {...form.register(`pilgrims.${index}.lastName`)}
                      placeholder="Ben Ali"
                      className={form.formState.errors.pilgrims?.[index]?.lastName ? "border-red-500 focus-visible:ring-red-500 rounded-lg" : "rounded-lg"}
                    />
                    {form.formState.errors.pilgrims?.[index]?.lastName && (
                      <p className="text-sm text-red-500 font-medium animate-in fade-in slide-in-from-top-1 duration-200">
                        {form.formState.errors.pilgrims[index]?.lastName?.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-[#1e3a8a]">Date de naissance *</Label>
                    <Input
                      type="date"
                      {...form.register(`pilgrims.${index}.birthDate`)}
                      className={form.formState.errors.pilgrims?.[index]?.birthDate ? "border-red-500 focus-visible:ring-red-500 rounded-lg" : "rounded-lg"}
                    />
                    {form.formState.errors.pilgrims?.[index]?.birthDate && (
                      <p className="text-sm text-red-500 font-medium animate-in fade-in slide-in-from-top-1 duration-200">
                        {form.formState.errors.pilgrims[index]?.birthDate?.message}
                      </p>
                    )}
                  </div>
                </div>

                <Separator />

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-[#1e3a8a]">Nationalité *</Label>
                    <Input
                      {...form.register(`pilgrims.${index}.nationality`)}
                      placeholder="TN"
                      maxLength={2}
                      className={form.formState.errors.pilgrims?.[index]?.nationality ? "border-red-500 focus-visible:ring-red-500 rounded-lg" : "rounded-lg"}
                    />
                    {form.formState.errors.pilgrims?.[index]?.nationality && (
                      <p className="text-sm text-red-500 font-medium animate-in fade-in slide-in-from-top-1 duration-200">
                        {form.formState.errors.pilgrims[index]?.nationality?.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-[#1e3a8a]">Genre *</Label>
                    <Select
                      value={watchedPilgrims[index]?.gender}
                      onValueChange={(v) => form.setValue(`pilgrims.${index}.gender`, v as "male" | "female")}
                    >
                      <SelectTrigger className="rounded-lg">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">Homme</SelectItem>
                        <SelectItem value="female">Femme</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-[#1e3a8a]">Situation matrimoniale *</Label>
                    <Select
                      value={watchedPilgrims[index]?.maritalStatus}
                      onValueChange={(v) => form.setValue(`pilgrims.${index}.maritalStatus`, v as any)}
                    >
                      <SelectTrigger className="rounded-lg">
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-[#1e3a8a]">Téléphone *</Label>
                    <Input
                      {...form.register(`pilgrims.${index}.phone`)}
                      placeholder="+216 98 123 456"
                      className={form.formState.errors.pilgrims?.[index]?.phone ? "border-red-500 focus-visible:ring-red-500 rounded-lg" : "rounded-lg"}
                    />
                    {form.formState.errors.pilgrims?.[index]?.phone && (
                      <p className="text-sm text-red-500 font-medium animate-in fade-in slide-in-from-top-1 duration-200">
                        {form.formState.errors.pilgrims[index]?.phone?.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-[#1e3a8a]">Email</Label>
                    <Input
                      type="email"
                      {...form.register(`pilgrims.${index}.email`)}
                      placeholder="email@example.com"
                      className={form.formState.errors.pilgrims?.[index]?.email ? "border-red-500 focus-visible:ring-red-500 rounded-lg" : "rounded-lg"}
                    />
                    {form.formState.errors.pilgrims?.[index]?.email && (
                      <p className="text-sm text-red-500 font-medium animate-in fade-in slide-in-from-top-1 duration-200">
                        {form.formState.errors.pilgrims[index]?.email?.message}
                      </p>
                    )}
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-[#1e3a8a]">Adresse</Label>
                  <Input
                    {...form.register(`pilgrims.${index}.address`)}
                    placeholder="123 Rue de la République, Tunis"
                    className="rounded-lg"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-[#1e3a8a]">Ville</Label>
                    <Input
                      {...form.register(`pilgrims.${index}.city`)}
                      placeholder="Tunis"
                      className="rounded-lg"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-[#1e3a8a]">Code postal</Label>
                    <Input
                      {...form.register(`pilgrims.${index}.postalCode`)}
                      placeholder="1001"
                      className="rounded-lg"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-[#1e3a8a]">Pays de résidence *</Label>
                    <Input
                      {...form.register(`pilgrims.${index}.country`)}
                      placeholder="TN"
                      maxLength={2}
                      className={form.formState.errors.pilgrims?.[index]?.country ? "border-red-500 focus-visible:ring-red-500 rounded-lg" : "rounded-lg"}
                    />
                    {form.formState.errors.pilgrims?.[index]?.country && (
                      <p className="text-sm text-red-500 font-medium animate-in fade-in slide-in-from-top-1 duration-200">
                        {form.formState.errors.pilgrims[index]?.country?.message}
                      </p>
                    )}
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label className="font-semibold text-[#1e3a8a]">Passeport</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-[#1e3a8a]">Numéro de passeport *</Label>
                      <Input
                        {...form.register(`pilgrims.${index}.passportNumber`)}
                        placeholder="A12345678"
                        className={form.formState.errors.pilgrims?.[index]?.passportNumber ? "border-red-500 focus-visible:ring-red-500 rounded-lg" : "rounded-lg"}
                      />
                      {form.formState.errors.pilgrims?.[index]?.passportNumber && (
                        <p className="text-sm text-red-500 font-medium animate-in fade-in slide-in-from-top-1 duration-200">
                          {form.formState.errors.pilgrims[index]?.passportNumber?.message}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-[#1e3a8a]">Pays émetteur *</Label>
                      <Input
                        {...form.register(`pilgrims.${index}.passportIssuingCountry`)}
                        placeholder="TN"
                        maxLength={2}
                        className={form.formState.errors.pilgrims?.[index]?.passportIssuingCountry ? "border-red-500 focus-visible:ring-red-500 rounded-lg" : "rounded-lg"}
                      />
                      {form.formState.errors.pilgrims?.[index]?.passportIssuingCountry && (
                        <p className="text-sm text-red-500 font-medium animate-in fade-in slide-in-from-top-1 duration-200">
                          {form.formState.errors.pilgrims[index]?.passportIssuingCountry?.message}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-[#1e3a8a]">Date d'émission *</Label>
                      <Input
                        type="date"
                        {...form.register(`pilgrims.${index}.passportIssueDate`)}
                        className={form.formState.errors.pilgrims?.[index]?.passportIssueDate ? "border-red-500 focus-visible:ring-red-500 rounded-lg" : "rounded-lg"}
                      />
                      {form.formState.errors.pilgrims?.[index]?.passportIssueDate && (
                        <p className="text-sm text-red-500 font-medium animate-in fade-in slide-in-from-top-1 duration-200">
                          {form.formState.errors.pilgrims[index]?.passportIssueDate?.message}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-[#1e3a8a]">Date d'expiration *</Label>
                      <Input
                        type="date"
                        {...form.register(`pilgrims.${index}.passportExpiryDate`)}
                        className={form.formState.errors.pilgrims?.[index]?.passportExpiryDate ? "border-red-500 focus-visible:ring-red-500 rounded-lg" : "rounded-lg"}
                      />
                      {form.formState.errors.pilgrims?.[index]?.passportExpiryDate && (
                        <p className="text-sm text-red-500 font-medium animate-in fade-in slide-in-from-top-1 duration-200">
                          {form.formState.errors.pilgrims[index]?.passportExpiryDate?.message}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-[#1e3a8a]">Type de chambre</Label>
                  <Select
                    value={watchedPilgrims[index]?.roomType}
                    onValueChange={(v) => form.setValue(`pilgrims.${index}.roomType`, v as any)}
                  >
                    <SelectTrigger className="rounded-lg">
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

        {/* Summary */}
        <Card className="rounded-lg border-2 border-[#1e3a8a]/10 bg-[#1e3a8a]/5">
          <CardHeader className="bg-[#1e3a8a]/10 rounded-t-lg">
            <CardTitle className="flex items-center gap-2 text-[#1e3a8a]">
              <CreditCard className="w-5 h-5" />
              Récapitulatif
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <div className="flex justify-between items-center">
              <span className="text-sm sm:text-base">Nombre de pèlerins</span>
              <Badge variant="secondary" className="bg-[#f59e0b] text-white rounded-lg">{watchedPilgrims.length}</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm sm:text-base">Prix par pèlerin</span>
              <span className="font-semibold text-[#1e3a8a]">{pricePerPilgrim.toFixed(3)} DT</span>
            </div>
            <Separator className="bg-[#1e3a8a]/20" />
            <div className="flex justify-between items-center text-lg sm:text-xl">
              <span className="font-semibold text-[#1e3a8a]">Total TTC</span>
              <span className="font-bold text-[#f59e0b]">{totalPrice.toFixed(3)} DT</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Le montant sera débité de votre wallet Easy2Book.
            </p>
          </CardContent>
        </Card>

        <Button
          type="submit"
          size="lg"
          className="w-full bg-[#1e3a8a] hover:bg-[#1e3a8a]/90 text-white rounded-lg"
          disabled={isSubmitting || !watchedPackageId || !watchedDepartureDate}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              <span className="hidden sm:inline">Traitement en cours...</span>
              <span className="sm:hidden">Traitement...</span>
            </>
          ) : (
            <span className="hidden sm:inline">Confirmer la Réservation</span>
            <span className="sm:hidden">Confirmer</span>
          )}
        </Button>
      </form>
    </div>
  )
}
