"use client"

/**
 * Formulaire de réservation Omra B2C (tunnel public).
 *
 * Étape unique : choix de la date de départ, coordonnées du contact,
 * fiches pèlerins (ajout / retrait), récap prix en temps réel, puis
 * soumission vers `createOmraB2CBooking`. Redirige vers la page de
 * confirmation en cas de succès.
 */

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CalendarDays, Loader2, Plus, Trash2, Users } from "lucide-react"
import { toast } from "sonner"
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
import { createOmraB2CBooking } from "@/lib/omra/b2c-booking-actions"
import type { OmraB2CBookingInput } from "@/lib/omra/b2c-booking-shared"

export interface B2CAllotmentOption {
  departureDate: string
  availableCount: number
  overridePrice: string | null
  bookingDeadline: string | null
}

interface PilgrimForm {
  firstName: string
  lastName: string
  birthDate: string
  gender: "male" | "female"
  nationality: string
  passportNumber: string
  passportIssueDate: string
  passportExpiryDate: string
  passportIssuingCountry: string
}

function emptyPilgrim(): PilgrimForm {
  return {
    firstName: "",
    lastName: "",
    birthDate: "",
    gender: "male",
    nationality: "TN",
    passportNumber: "",
    passportIssueDate: "",
    passportExpiryDate: "",
    passportIssuingCountry: "TN",
  }
}

function fmtPrice(v: number): string {
  return v.toLocaleString("fr-FR")
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

export function OmraB2CBookingForm({
  packageId,
  basePrice,
  allotments,
}: {
  packageId: string
  basePrice: string
  allotments: B2CAllotmentOption[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [departureDate, setDepartureDate] = useState<string>(
    allotments[0]?.departureDate ?? "",
  )
  const [contactFirstName, setContactFirstName] = useState("")
  const [contactLastName, setContactLastName] = useState("")
  const [contactEmail, setContactEmail] = useState("")
  const [contactPhone, setContactPhone] = useState("")
  const [pilgrims, setPilgrims] = useState<PilgrimForm[]>([emptyPilgrim()])

  const selected = allotments.find((a) => a.departureDate === departureDate)
  const pricePerPilgrim = selected?.overridePrice
    ? parseFloat(selected.overridePrice)
    : parseFloat(basePrice)
  const total = pricePerPilgrim * pilgrims.length
  const maxSeats = selected?.availableCount ?? 0

  const canAdd = pilgrims.length < Math.min(20, Math.max(1, maxSeats))

  function updatePilgrim(i: number, patch: Partial<PilgrimForm>) {
    setPilgrims((prev) =>
      prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)),
    )
  }

  function addPilgrim() {
    if (!canAdd) return
    setPilgrims((prev) => [...prev, emptyPilgrim()])
  }

  function removePilgrim(i: number) {
    setPilgrims((prev) =>
      prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i),
    )
  }

  const disabledReason = useMemo(() => {
    if (allotments.length === 0) return "Aucune date de départ disponible"
    if (!departureDate) return "Sélectionnez une date de départ"
    if (pilgrims.length > maxSeats)
      return `Seulement ${maxSeats} place(s) disponible(s) pour cette date`
    return null
  }, [allotments.length, departureDate, pilgrims.length, maxSeats])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const payload: OmraB2CBookingInput = {
      packageId,
      departureDate,
      contactFirstName: contactFirstName.trim(),
      contactLastName: contactLastName.trim(),
      contactEmail: contactEmail.trim(),
      contactPhone: contactPhone.trim(),
      pilgrims: pilgrims.map((p) => ({
        firstName: p.firstName.trim(),
        lastName: p.lastName.trim(),
        birthDate: p.birthDate,
        gender: p.gender,
        nationality: p.nationality.trim().toUpperCase(),
        passportNumber: p.passportNumber.trim(),
        passportIssueDate: p.passportIssueDate,
        passportExpiryDate: p.passportExpiryDate,
        passportIssuingCountry: p.passportIssuingCountry.trim().toUpperCase(),
      })),
    }

    startTransition(async () => {
      const res = await createOmraB2CBooking(payload)
      if (res.ok) {
        toast.success("Réservation enregistrée", {
          description: `Référence ${res.publicRef}`,
        })
        router.push(`/omra/reservation/${res.publicRef}`)
      } else {
        toast.error("Réservation impossible", { description: res.error })
      }
    })
  }

  if (allotments.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-card p-8 text-center">
        <CalendarDays className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <p className="font-medium">Aucune date de départ ouverte</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Les prochains départs seront publiés prochainement. Contactez nos
          conseillers au +216 98 140 514.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Date de départ */}
      <section className="rounded-2xl border bg-card p-6">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
          <CalendarDays className="h-5 w-5 text-emerald-600" />
          Date de départ
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="departure">Choisir un départ</Label>
            <Select value={departureDate} onValueChange={setDepartureDate}>
              <SelectTrigger id="departure">
                <SelectValue placeholder="Sélectionnez une date" />
              </SelectTrigger>
              <SelectContent>
                {allotments.map((a) => (
                  <SelectItem
                    key={a.departureDate}
                    value={a.departureDate}
                    disabled={a.availableCount <= 0}
                  >
                    {fmtDate(a.departureDate)} · {a.availableCount} place(s)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col justify-end">
            <p className="text-sm text-muted-foreground">Prix par personne</p>
            <p className="text-2xl font-bold text-emerald-700">
              {fmtPrice(pricePerPilgrim)}{" "}
              <span className="text-sm font-medium">TND</span>
            </p>
          </div>
        </div>
      </section>

      {/* Contact */}
      <section className="rounded-2xl border bg-card p-6">
        <h2 className="mb-4 text-lg font-bold">Vos coordonnées</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cfn">Prénom</Label>
            <Input
              id="cfn"
              required
              value={contactFirstName}
              onChange={(e) => setContactFirstName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cln">Nom</Label>
            <Input
              id="cln"
              required
              value={contactLastName}
              onChange={(e) => setContactLastName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cem">Email</Label>
            <Input
              id="cem"
              type="email"
              required
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cph">Téléphone</Label>
            <Input
              id="cph"
              required
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
            />
          </div>
        </div>
      </section>

      {/* Pèlerins */}
      <section className="rounded-2xl border bg-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Users className="h-5 w-5 text-emerald-600" />
            Pèlerins ({pilgrims.length})
          </h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addPilgrim}
            disabled={!canAdd}
          >
            <Plus className="mr-1 h-4 w-4" />
            Ajouter
          </Button>
        </div>

        <div className="space-y-6">
          {pilgrims.map((p, i) => (
            <div key={i} className="rounded-xl border p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="font-semibold">Pèlerin {i + 1}</p>
                {pilgrims.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removePilgrim(i)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Prénom</Label>
                  <Input
                    required
                    value={p.firstName}
                    onChange={(e) =>
                      updatePilgrim(i, { firstName: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Nom</Label>
                  <Input
                    required
                    value={p.lastName}
                    onChange={(e) =>
                      updatePilgrim(i, { lastName: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Date de naissance</Label>
                  <Input
                    type="date"
                    required
                    value={p.birthDate}
                    onChange={(e) =>
                      updatePilgrim(i, { birthDate: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Genre</Label>
                  <Select
                    value={p.gender}
                    onValueChange={(v) =>
                      updatePilgrim(i, { gender: v as "male" | "female" })
                    }
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
                <div className="space-y-1.5">
                  <Label>Nationalité (ISO-2)</Label>
                  <Input
                    required
                    maxLength={2}
                    value={p.nationality}
                    onChange={(e) =>
                      updatePilgrim(i, {
                        nationality: e.target.value.toUpperCase(),
                      })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>N° de passeport</Label>
                  <Input
                    required
                    value={p.passportNumber}
                    onChange={(e) =>
                      updatePilgrim(i, { passportNumber: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Passeport délivré le</Label>
                  <Input
                    type="date"
                    required
                    value={p.passportIssueDate}
                    onChange={(e) =>
                      updatePilgrim(i, { passportIssueDate: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Passeport expire le</Label>
                  <Input
                    type="date"
                    required
                    value={p.passportExpiryDate}
                    onChange={(e) =>
                      updatePilgrim(i, { passportExpiryDate: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Pays émetteur (ISO-2)</Label>
                  <Input
                    required
                    maxLength={2}
                    value={p.passportIssuingCountry}
                    onChange={(e) =>
                      updatePilgrim(i, {
                        passportIssuingCountry: e.target.value.toUpperCase(),
                      })
                    }
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Récap + soumission */}
      <section className="rounded-2xl border bg-emerald-50 p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">
              {pilgrims.length} pèlerin(s) × {fmtPrice(pricePerPilgrim)} TND
            </p>
            <p className="text-3xl font-bold text-emerald-800">
              {fmtPrice(total)} <span className="text-base font-medium">TND</span>
            </p>
          </div>
        </div>
        {disabledReason ? (
          <p className="mb-3 text-sm font-medium text-amber-700">
            {disabledReason}
          </p>
        ) : null}
        <Button
          type="submit"
          size="lg"
          className="w-full bg-emerald-700 hover:bg-emerald-800"
          disabled={pending || disabledReason !== null}
        >
          {pending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Traitement…
            </>
          ) : (
            "Confirmer la réservation"
          )}
        </Button>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Aucun paiement en ligne — un conseiller vous recontacte pour finaliser.
        </p>
      </section>
    </form>
  )
}
