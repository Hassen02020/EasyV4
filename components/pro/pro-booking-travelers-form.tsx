"use client"

/**
 * Formulaire voyageur B2B — chemin myGo réel (Phase 9).
 *
 * Construit un `BookingDraft` avec les métadonnées EXACTES attendues par
 * `extractHotelProviderMetadata`/`hotelProviderMetadataSchema`
 * (lib/booking/hotel-provider-booking.ts) — myGoToken/cityId/hotelId/
 * boardingId/roomId/childrenAges — puis appelle `createReservationFromDraft`
 * (lib/booking/actions.ts) SANS AUCUNE MODIFICATION : c'est le même
 * pipeline qui confirme déjà réellement les réservations hôtel myGo,
 * débite le wallet agence, génère la facture et l'événement de
 * confirmation. Avant cette phase, le formulaire B2B fixture construisait
 * une métadonnée différente (hotelId string, pas de myGoToken/boardingId/
 * roomId) : `extractHotelProviderMetadata` la rejetait silencieusement,
 * confirmHotelWithProvider() ne s'exécutait jamais, et le débit wallet se
 * produisait quand même pour un hôtel jamais réellement confirmé auprès de
 * myGo — c'est le point de rupture identifié et corrigé ici.
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { AlertTriangle, Loader2 } from "lucide-react"
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
import { createReservationFromDraft } from "@/lib/booking/actions"
import type { BookingDraft } from "@/lib/booking/schemas"

interface ProBookingTravelersFormProps {
  hotelName: string
  roomName: string
  boardingName: string
  priceTnd: number
  currency: string
  checkin: string
  checkout: string
  adults: number
  childrenCount: number
  childrenAges: number[]
  providerMeta: {
    myGoToken: string
    cityId: number
    hotelId: number
    boardingId: number
    boardingCode: string
    roomId: number
  }
}

const initialTraveler = {
  civility: "M" as "M" | "Mme" | "Mlle",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  civicIdType: "cin" as "cin" | "passport",
  civicId: "",
}

export function ProBookingTravelersForm({
  hotelName,
  roomName,
  boardingName,
  priceTnd,
  currency,
  checkin,
  checkout,
  adults,
  childrenCount,
  childrenAges,
  providerMeta,
}: ProBookingTravelersFormProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [traveler, setTraveler] = useState(initialTraveler)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const canSubmit =
    traveler.firstName.trim().length >= 2 &&
    traveler.lastName.trim().length >= 2 &&
    /\S+@\S+\.\S+/.test(traveler.email) &&
    traveler.phone.trim().length >= 7 &&
    traveler.civicId.trim().length >= 6

  function handleSubmit() {
    if (!canSubmit) return
    setSubmitError(null)

    startTransition(async () => {
      const draft: BookingDraft = {
        module: "hotel",
        offerId: String(providerMeta.hotelId),
        offerLabel: `${hotelName} — ${roomName} (${boardingName})`,
        startDate: checkin,
        endDate: checkout,
        adults,
        children: childrenCount,
        unitPriceTnd: adults > 0 ? priceTnd / adults : priceTnd,
        unitChildPriceTnd: 0,
        currency: currency === "TND" ? "TND" : "TND",
        metadata: {
          myGoToken: providerMeta.myGoToken,
          cityId: providerMeta.cityId,
          hotelId: providerMeta.hotelId,
          boardingId: providerMeta.boardingId,
          boardingCode: providerMeta.boardingCode,
          roomId: providerMeta.roomId,
          childrenAges,
        },
      }

      const result = await createReservationFromDraft({
        draft,
        traveler: {
          civility: traveler.civility,
          firstName: traveler.firstName.trim(),
          lastName: traveler.lastName.trim(),
          email: traveler.email.trim(),
          phone: traveler.phone.trim(),
          civicIdType: traveler.civicIdType,
          civicId: traveler.civicId.trim(),
        },
      })

      if (!result.ok) {
        setSubmitError(result.error)
        toast.error(result.error, { duration: 6000 })
        return
      }

      router.push(`/pro/booking/confirmation/${result.publicRef}`)
    })
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <section className="bg-card border-border/60 shadow-e2b-soft rounded-2xl border p-4 md:p-5">
        <h2 className="text-foreground mb-4 text-base font-semibold">
          Voyageur principal
        </h2>
        {submitError && (
          <div className="border-destructive/40 bg-destructive/5 text-destructive mb-4 flex items-start gap-2 rounded-lg border p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {submitError}
          </div>
        )}
        <div className="grid gap-3">
          <div className="grid gap-2 sm:grid-cols-[120px_1fr_1fr]">
            <div>
              <Label className="text-xs">Civilité *</Label>
              <Select
                value={traveler.civility}
                onValueChange={(v) =>
                  setTraveler((p) => ({ ...p, civility: v as "M" | "Mme" | "Mlle" }))
                }
              >
                <SelectTrigger className="mt-1 h-9">
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
              <Label htmlFor="pro-first" className="text-xs">Prénom *</Label>
              <Input
                id="pro-first"
                value={traveler.firstName}
                onChange={(e) => setTraveler((p) => ({ ...p, firstName: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="pro-last" className="text-xs">Nom *</Label>
              <Input
                id="pro-last"
                value={traveler.lastName}
                onChange={(e) => setTraveler((p) => ({ ...p, lastName: e.target.value }))}
                className="mt-1"
              />
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label htmlFor="pro-email" className="text-xs">Email *</Label>
              <Input
                id="pro-email"
                type="email"
                value={traveler.email}
                onChange={(e) => setTraveler((p) => ({ ...p, email: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="pro-phone" className="text-xs">Téléphone *</Label>
              <Input
                id="pro-phone"
                type="tel"
                value={traveler.phone}
                onChange={(e) => setTraveler((p) => ({ ...p, phone: e.target.value }))}
                placeholder="+216 98 000 000"
                className="mt-1"
              />
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-[160px_1fr]">
            <div>
              <Label className="text-xs">Type pièce *</Label>
              <Select
                value={traveler.civicIdType}
                onValueChange={(v) =>
                  setTraveler((p) => ({ ...p, civicIdType: v as "cin" | "passport" }))
                }
              >
                <SelectTrigger className="mt-1 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cin">CIN</SelectItem>
                  <SelectItem value="passport">Passeport</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="pro-civic" className="text-xs">
                {traveler.civicIdType === "cin" ? "N° CIN (8 chiffres) *" : "N° Passeport *"}
              </Label>
              <Input
                id="pro-civic"
                value={traveler.civicId}
                onChange={(e) => setTraveler((p) => ({ ...p, civicId: e.target.value }))}
                className="mt-1"
              />
            </div>
          </div>
        </div>
      </section>

      <aside className="bg-card border-border/60 shadow-e2b-soft h-fit rounded-2xl border p-4 md:p-5">
        <h2 className="text-foreground mb-3 text-sm font-semibold">Récapitulatif</h2>
        <dl className="space-y-2 text-sm">
          <div>
            <dt className="text-muted-foreground text-xs">Hôtel</dt>
            <dd className="text-foreground font-medium">{hotelName}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Chambre</dt>
            <dd className="text-foreground">{roomName} — {boardingName}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Séjour</dt>
            <dd className="text-foreground">{checkin} → {checkout}</dd>
          </div>
        </dl>
        <div className="border-border/50 mt-4 border-t pt-3">
          <p className="text-muted-foreground text-xs">Total (prix agence)</p>
          <p className="text-primary text-xl font-bold tabular-nums">
            {priceTnd.toLocaleString("fr-FR")} {currency}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            Revérifié et débité de votre wallet au moment de la confirmation
            fournisseur — le montant final peut différer si le tarif a changé.
          </p>
        </div>
        <Button
          type="button"
          size="lg"
          onClick={handleSubmit}
          disabled={!canSubmit || pending}
          className="mt-4 w-full rounded-xl"
        >
          {pending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
          Confirmer la réservation
        </Button>
      </aside>
    </div>
  )
}
