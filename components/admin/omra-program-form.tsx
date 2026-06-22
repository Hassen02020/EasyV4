"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { OmraPackage, OmraItineraryDay } from "@/lib/db/schema/omra"

const TYPES = [
  { value: "omra", label: "Omra Régulière" },
  { value: "ramadan", label: "Omra Ramadan" },
  { value: "umrah_plus", label: "Omra + Ziarat" },
  { value: "hajj", label: "Hajj" },
]

const FORMULES = [
  { value: "moyasara", label: "Moyasara (Économique)" },
  { value: "al_haram", label: "Al-Haram (Confort)" },
  { value: "abraj_premium", label: "Abraj Premium" },
  { value: "vip_exclusive", label: "VIP Exclusive" },
]

const MEAL_PLANS = [
  { value: "room_only", label: "Sans repas" },
  { value: "breakfast", label: "Petit déjeuner" },
  { value: "half_board", label: "Demi-pension" },
  { value: "full_board", label: "Pension complète" },
  { value: "all_inclusive", label: "Tout inclus" },
]

const HOTEL_CATEGORIES = [
  { value: "economy", label: "Économique (1-2★)" },
  { value: "standard", label: "Standard (3★)" },
  { value: "comfort", label: "Confort (4★)" },
  { value: "luxury", label: "Luxe (5★)" },
  { value: "premium", label: "Premium (5★ luxe)" },
]

interface Props {
  action: (formData: FormData) => void | Promise<void>
  initial?: OmraPackage | null
  submitLabel?: string
}

function itineraryToText(itinerary: OmraItineraryDay[] | null | undefined) {
  if (!itinerary || itinerary.length === 0) return ""
  return itinerary.map((d) => `${d.title} | ${d.description}`).join("\n")
}

export function OmraProgramForm({ action, initial, submitLabel }: Props) {
  const [error, setError] = useState<string | null>(null)

  async function handleAction(formData: FormData) {
    setError(null)
    try {
      await action(formData)
    } catch (e) {
      // Les redirections Next sont des "erreurs" attendues : on les relance.
      const message = e instanceof Error ? e.message : String(e)
      if (message === "NEXT_REDIRECT" || message.includes("NEXT_REDIRECT")) {
        throw e
      }
      setError(message)
    }
  }

  return (
    <form action={handleAction} className="space-y-6">
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Identité */}
        <Card>
          <CardHeader>
            <CardTitle>Identité du programme</CardTitle>
            <CardDescription>Nom, type et formule commerciale</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nom du programme *</Label>
              <Input
                id="name"
                name="name"
                required
                defaultValue={initial?.name ?? ""}
                placeholder="Ex: Omra Abraj Premium - 11 jours"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nameAr">Nom en arabe</Label>
              <Input
                id="nameAr"
                name="nameAr"
                dir="rtl"
                defaultValue={initial?.nameAr ?? ""}
                placeholder="عمرة الأبراج"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="type">Type *</Label>
                <Select name="type" defaultValue={initial?.type ?? "omra"}>
                  <SelectTrigger id="type">
                    <SelectValue placeholder="Sélectionner" />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="formule">Formule</Label>
                <Select
                  name="formule"
                  defaultValue={initial?.formule ?? undefined}
                >
                  <SelectTrigger id="formule">
                    <SelectValue placeholder="Sélectionner" />
                  </SelectTrigger>
                  <SelectContent>
                    {FORMULES.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">Slug (URL) — auto si vide</Label>
              <Input
                id="slug"
                name="slug"
                defaultValue={initial?.slug ?? ""}
                placeholder="omra-abraj-premium-2026"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                rows={3}
                defaultValue={initial?.description ?? ""}
                placeholder="Présentation du programme…"
              />
            </div>
          </CardContent>
        </Card>

        {/* Durée, dates, prix */}
        <Card>
          <CardHeader>
            <CardTitle>Durée, dates & prix</CardTitle>
            <CardDescription>Validité et tarification (TND)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="durationDays">Durée (jours) *</Label>
                <Input
                  id="durationDays"
                  name="durationDays"
                  type="number"
                  min={1}
                  required
                  defaultValue={initial?.durationDays ?? ""}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="basePrice">Prix de base / pèlerin (TND) *</Label>
                <Input
                  id="basePrice"
                  name="basePrice"
                  type="number"
                  step="0.001"
                  min={0}
                  required
                  defaultValue={initial?.basePrice ?? ""}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="validFrom">Valide du *</Label>
                <Input
                  id="validFrom"
                  name="validFrom"
                  type="date"
                  required
                  defaultValue={initial?.validFrom ?? ""}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="validUntil">Valide jusqu&apos;au *</Label>
                <Input
                  id="validUntil"
                  name="validUntil"
                  type="date"
                  required
                  defaultValue={initial?.validUntil ?? ""}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="departureCity">Départ de</Label>
                <Input
                  id="departureCity"
                  name="departureCity"
                  defaultValue={initial?.departureCity ?? "Tunis"}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="minPilgrims">Min. pèlerins</Label>
                <Input
                  id="minPilgrims"
                  name="minPilgrims"
                  type="number"
                  min={1}
                  defaultValue={initial?.minPilgrims ?? 20}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxPilgrims">Max. pèlerins</Label>
                <Input
                  id="maxPilgrims"
                  name="maxPilgrims"
                  type="number"
                  min={1}
                  defaultValue={initial?.maxPilgrims ?? 45}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="alternativeDurations">
                Durées alternatives (nuits, séparées par des virgules)
              </Label>
              <Input
                id="alternativeDurations"
                name="alternativeDurations"
                defaultValue={(initial?.alternativeDurations ?? []).join(", ")}
                placeholder="10, 14"
              />
            </div>
          </CardContent>
        </Card>

        {/* Séjour Médine / Makkah */}
        <Card>
          <CardHeader>
            <CardTitle>Séjour Médine & La Mecque</CardTitle>
            <CardDescription>Nuits, repas et hôtels par ville</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-3 rounded-lg border p-4">
              <p className="text-sm font-semibold">Médine</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="nightsMedina">Nuits</Label>
                  <Input
                    id="nightsMedina"
                    name="nightsMedina"
                    type="number"
                    min={0}
                    defaultValue={initial?.nightsMedina ?? ""}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mealPlanMedina">Repas</Label>
                  <Select
                    name="mealPlanMedina"
                    defaultValue={initial?.mealPlanMedina ?? undefined}
                  >
                    <SelectTrigger id="mealPlanMedina">
                      <SelectValue placeholder="Sélectionner" />
                    </SelectTrigger>
                    <SelectContent>
                      {MEAL_PLANS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="hotelMedinaName">Hôtel</Label>
                  <Input
                    id="hotelMedinaName"
                    name="hotelMedinaName"
                    defaultValue={initial?.hotelMedinaName ?? ""}
                    placeholder="Shaza Regency Plaza"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hotelMedinaCategory">Catégorie</Label>
                  <Select
                    name="hotelMedinaCategory"
                    defaultValue={initial?.hotelMedinaCategory ?? undefined}
                  >
                    <SelectTrigger id="hotelMedinaCategory">
                      <SelectValue placeholder="Sélectionner" />
                    </SelectTrigger>
                    <SelectContent>
                      {HOTEL_CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-lg border p-4">
              <p className="text-sm font-semibold">La Mecque (Makkah)</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="nightsMakkah">Nuits</Label>
                  <Input
                    id="nightsMakkah"
                    name="nightsMakkah"
                    type="number"
                    min={0}
                    defaultValue={initial?.nightsMakkah ?? ""}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mealPlanMakkah">Repas</Label>
                  <Select
                    name="mealPlanMakkah"
                    defaultValue={initial?.mealPlanMakkah ?? undefined}
                  >
                    <SelectTrigger id="mealPlanMakkah">
                      <SelectValue placeholder="Sélectionner" />
                    </SelectTrigger>
                    <SelectContent>
                      {MEAL_PLANS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="hotelMakkahName">Hôtel</Label>
                  <Input
                    id="hotelMakkahName"
                    name="hotelMakkahName"
                    defaultValue={initial?.hotelMakkahName ?? ""}
                    placeholder="Swissotel Makkah"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hotelMakkahCategory">Catégorie</Label>
                  <Select
                    name="hotelMakkahCategory"
                    defaultValue={initial?.hotelMakkahCategory ?? undefined}
                  >
                    <SelectTrigger id="hotelMakkahCategory">
                      <SelectValue placeholder="Sélectionner" />
                    </SelectTrigger>
                    <SelectContent>
                      {HOTEL_CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Inclusions */}
        <Card>
          <CardHeader>
            <CardTitle>Inclusions & options</CardTitle>
            <CardDescription>Prestations comprises dans le prix</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(
              [
                ["includesVisa", "Visa", initial?.includesVisa ?? true],
                ["includesFlights", "Vols", initial?.includesFlights ?? true],
                ["includesHotels", "Hôtels", initial?.includesHotels ?? true],
                [
                  "includesTransfers",
                  "Transferts",
                  initial?.includesTransfers ?? true,
                ],
                ["includesZiarat", "Ziarat", initial?.includesZiarat ?? true],
                [
                  "includesGuide",
                  "Guide accompagnateur",
                  initial?.includesGuide ?? false,
                ],
              ] as const
            ).map(([name, label, checked]) => (
              <label
                key={name}
                className="flex items-center gap-3 text-sm"
                htmlFor={name}
              >
                <Checkbox id={name} name={name} defaultChecked={checked} />
                {label}
              </label>
            ))}
            <div className="space-y-2 pt-2">
              <Label htmlFor="status">Statut</Label>
              <Select name="status" defaultValue={initial?.status ?? "active"}>
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Actif (publié)</SelectItem>
                  <SelectItem value="draft">Brouillon</SelectItem>
                  <SelectItem value="archived">Archivé</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label
              className="flex items-center gap-3 pt-1 text-sm"
              htmlFor="featured"
            >
              <Checkbox
                id="featured"
                name="featured"
                defaultChecked={initial?.featured ?? false}
              />
              Mettre en avant sur la page d&apos;accueil Omra
            </label>
            <label
              className="flex items-center gap-3 text-sm"
              htmlFor="allowsInstallments"
            >
              <Checkbox
                id="allowsInstallments"
                name="allowsInstallments"
                defaultChecked={initial?.allowsInstallments ?? true}
              />
              Facilités de paiement disponibles
            </label>
          </CardContent>
        </Card>
      </div>

      {/* Contenu éditorial */}
      <Card>
        <CardHeader>
          <CardTitle>Contenu éditorial</CardTitle>
          <CardDescription>
            Points forts, itinéraire et photos affichés sur la fiche publique
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="highlights">Points forts (une puce par ligne)</Label>
            <Textarea
              id="highlights"
              name="highlights"
              rows={4}
              defaultValue={(initial?.highlights ?? []).join("\n")}
              placeholder={
                "Hébergement avec accès facile au Haram\nPetit déjeuner inclus\nAccompagnement professionnel"
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="itinerary">
              Itinéraire (une étape par ligne : « Titre | Description »)
            </Label>
            <Textarea
              id="itinerary"
              name="itinerary"
              rows={5}
              defaultValue={itineraryToText(initial?.itinerary)}
              placeholder={
                "Arrivée à Médine | Accueil et transfert vers l'hôtel\nVisites des lieux saints | Ziarat guidée à Médine"
              }
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="coverImageUrl">Image de couverture (URL)</Label>
              <Input
                id="coverImageUrl"
                name="coverImageUrl"
                type="url"
                defaultValue={initial?.coverImageUrl ?? ""}
                placeholder="https://…"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="photoUrls">Galerie photos (une URL par ligne)</Label>
              <Textarea
                id="photoUrls"
                name="photoUrls"
                rows={3}
                defaultValue={(initial?.photoUrls ?? []).join("\n")}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        <Button variant="outline" asChild>
          <Link href="/admin/products/omra">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Annuler
          </Link>
        </Button>
        <Button type="submit" className="bg-emerald-700 hover:bg-emerald-800">
          <Save className="mr-2 h-4 w-4" />
          {submitLabel ?? "Enregistrer"}
        </Button>
      </div>
    </form>
  )
}
