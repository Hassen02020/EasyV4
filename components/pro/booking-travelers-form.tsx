"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  ChevronDown,
  User,
  UserPlus,
  Hash,
  AlertTriangle,
  Wallet,
  Banknote,
  Building2,
  CreditCard,
  Loader2,
  ArrowRight,
} from "lucide-react"
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
import { cn } from "@/lib/utils"
import { BOARDING_LABEL, BOARDING_SHORT } from "@/lib/pro/hotels-fixture"
import { formatTND } from "@/lib/pro/format"
import { type BookingContext } from "@/lib/pro/booking-context"
import { createReservationFromDraft } from "@/lib/booking/actions"
import type { BookingDraft } from "@/lib/booking/schemas"

type Traveler = {
  firstName: string
  lastName: string
  isMain: boolean
}

type MainTraveler = {
  civility: "M" | "Mme" | "Mlle" | ""
  firstName: string
  lastName: string
  email: string
  phone: string
  civicIdType: "cin" | "passport"
  civicId: string
}

type PaymentMode = "deposit" | "transfer" | "card" | "check"

const PAYMENT_OPTIONS: Array<{
  id: PaymentMode
  label: string
  description: string
  icon: typeof Wallet
}> = [
  {
    id: "deposit",
    label: "Compte de dépôt",
    description: "Débit immédiat sur votre solde crédité",
    icon: Wallet,
  },
  {
    id: "transfer",
    label: "Virement bancaire",
    description: "Confirmation après réception du virement",
    icon: Building2,
  },
  {
    id: "card",
    label: "Carte bancaire",
    description: "Paiement sécurisé via passerelle",
    icon: CreditCard,
  },
  {
    id: "check",
    label: "Chèque bancaire",
    description: "À l'ordre de Easy2Book SARL",
    icon: Banknote,
  },
]

interface BookingTravelersFormProps {
  context: BookingContext
  /** Searchparams reportés (dates, pax, nights). */
  search: {
    checkin?: string
    checkout?: string
    nights?: number
    adults?: number
    children?: number
  }
}

export function BookingTravelersForm({
  context,
  search,
}: BookingTravelersFormProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  // 1 voyageur principal + 1 par chambre additionnelle
  const initialTravelers = useMemo<Traveler[]>(() => {
    const out: Traveler[] = []
    for (let i = 0; i < context.roomsCount; i++) {
      out.push({ firstName: "", lastName: "", isMain: i === 0 })
    }
    return out
  }, [context.roomsCount])

  const [travelers, setTravelers] = useState<Traveler[]>(initialTravelers)
  const [mainTraveler, setMainTraveler] = useState<MainTraveler>({
    civility: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    civicIdType: "cin",
    civicId: "",
  })
  const [internalRef, setInternalRef] = useState("")
  const [matricule, setMatricule] = useState("")
  const [payment, setPayment] = useState<PaymentMode | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const baseTotal = context.subtotal
  const finalTotal = baseTotal

  const mainTravelerValid = Boolean(
    mainTraveler.civility &&
    mainTraveler.firstName.trim().length >= 2 &&
    mainTraveler.lastName.trim().length >= 2 &&
    mainTraveler.email.trim().includes("@") &&
    mainTraveler.phone.trim().length >= 7 &&
    mainTraveler.civicId.trim().length >= 6,
  )
  const canSubmit = mainTravelerValid && payment !== null

  function updateTraveler(index: number, patch: Partial<Traveler>) {
    setTravelers((prev) =>
      prev.map((t, i) => (i === index ? { ...t, ...patch } : t)),
    )
  }

  function handleSubmit() {
    if (!canSubmit) return
    setSubmitError(null)

    startTransition(async () => {
      const firstOffer = context.offers[0]
      if (!firstOffer) return

      const draft: BookingDraft = {
        module: "hotel",
        offerId: String(context.hotel.id),
        offerLabel: context.hotel.name,
        startDate: search.checkin ?? new Date().toISOString().slice(0, 10),
        endDate: search.checkout ?? undefined,
        adults: search.adults ?? 2,
        children: search.children ?? 0,
        unitPriceTnd: finalTotal / Math.max(1, search.adults ?? 2),
        unitChildPriceTnd: 0,
        currency: "TND",
        metadata: {
          hotelId: context.hotel.id,
          internalRef: internalRef || undefined,
          matricule: matricule || undefined,
          paymentMode: payment,
          offers: context.offers.map((s) => ({
            id: s.offer.id,
            qty: s.qty,
            price: s.offer.price,
          })),
        },
      }

      const result = await createReservationFromDraft({
        draft,
        traveler: {
          civility: mainTraveler.civility as "M" | "Mme" | "Mlle",
          firstName: mainTraveler.firstName.trim(),
          lastName: mainTraveler.lastName.trim(),
          email: mainTraveler.email.trim(),
          phone: mainTraveler.phone.trim(),
          civicIdType: mainTraveler.civicIdType,
          civicId: mainTraveler.civicId.trim(),
        },
      })

      if (!result.ok) {
        setSubmitError(result.error)
        toast.error(result.error, { duration: 6000 })
        return
      }

      router.refresh()
      router.push(
        `/pro/booking/confirmation/${result.publicRef}?payment=${payment}&total=${finalTotal.toFixed(3)}&hotelId=${context.hotel.id}${
          internalRef ? `&ref=${encodeURIComponent(internalRef)}` : ""
        }`,
      )
    })
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        {/* Étape 1 — Voyageurs */}
        <section className="bg-card border-border/60 shadow-e2b-soft rounded-2xl border p-4 md:p-5">
          <header className="mb-4 flex items-center gap-2">
            <div className="bg-primary/10 text-primary flex h-9 w-9 items-center justify-center rounded-xl">
              <User className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-foreground text-base font-semibold">
                Voyageurs
              </h2>
              <p className="text-muted-foreground text-xs">
                {context.roomsCount} chambre{context.roomsCount > 1 ? "s" : ""}{" "}
                · {context.occupants} occupant
                {context.occupants > 1 ? "s" : ""}
              </p>
            </div>
          </header>

          <div className="space-y-4">
            {/* Voyageur principal — champs complets requis pour BDD */}
            <div className="border-border/50 rounded-xl border p-3 md:p-4">
              <p className="text-foreground mb-3 inline-flex items-center gap-1.5 text-sm font-semibold">
                <UserPlus className="text-primary h-3.5 w-3.5" />
                Voyageur principal
                <span className="text-primary ml-1 text-xs">*</span>
              </p>
              <div className="grid gap-3">
                {/* Civilité + Prénom + Nom */}
                <div className="grid gap-2 sm:grid-cols-[120px_1fr_1fr]">
                  <div>
                    <Label className="text-xs">Civilité *</Label>
                    <Select
                      value={mainTraveler.civility}
                      onValueChange={(v) =>
                        setMainTraveler((p) => ({ ...p, civility: v as "M" | "Mme" | "Mlle" }))
                      }
                    >
                      <SelectTrigger className="mt-1 h-9">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="M">M.</SelectItem>
                        <SelectItem value="Mme">Mme</SelectItem>
                        <SelectItem value="Mlle">Mlle</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="main-first" className="text-xs">Prénom *</Label>
                    <Input
                      id="main-first"
                      value={mainTraveler.firstName}
                      onChange={(e) =>
                        setMainTraveler((p) => ({ ...p, firstName: e.target.value }))
                      }
                      placeholder="Prénom"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="main-last" className="text-xs">Nom *</Label>
                    <Input
                      id="main-last"
                      value={mainTraveler.lastName}
                      onChange={(e) =>
                        setMainTraveler((p) => ({ ...p, lastName: e.target.value }))
                      }
                      placeholder="Nom"
                      className="mt-1"
                    />
                  </div>
                </div>
                {/* Email + Téléphone */}
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="main-email" className="text-xs">Email *</Label>
                    <Input
                      id="main-email"
                      type="email"
                      value={mainTraveler.email}
                      onChange={(e) =>
                        setMainTraveler((p) => ({ ...p, email: e.target.value }))
                      }
                      placeholder="exemple@email.com"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="main-phone" className="text-xs">Téléphone *</Label>
                    <Input
                      id="main-phone"
                      type="tel"
                      value={mainTraveler.phone}
                      onChange={(e) =>
                        setMainTraveler((p) => ({ ...p, phone: e.target.value }))
                      }
                      placeholder="+216 98 000 000"
                      className="mt-1"
                    />
                  </div>
                </div>
                {/* Pièce d'identité */}
                <div className="grid gap-2 sm:grid-cols-[160px_1fr]">
                  <div>
                    <Label className="text-xs">Type pièce *</Label>
                    <Select
                      value={mainTraveler.civicIdType}
                      onValueChange={(v) =>
                        setMainTraveler((p) => ({ ...p, civicIdType: v as "cin" | "passport" }))
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
                    <Label htmlFor="main-civic" className="text-xs">
                      {mainTraveler.civicIdType === "cin" ? "N° CIN (8 chiffres) *" : "N° Passeport *"}
                    </Label>
                    <Input
                      id="main-civic"
                      value={mainTraveler.civicId}
                      onChange={(e) =>
                        setMainTraveler((p) => ({ ...p, civicId: e.target.value }))
                      }
                      placeholder={mainTraveler.civicIdType === "cin" ? "12345678" : "AB1234567"}
                      className="mt-1"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Voyageurs additionnels (chambres supplémentaires) */}
            {travelers.slice(1).map((t, idx) => (
              <div
                key={idx + 1}
                className="border-border/50 rounded-xl border p-3 md:p-4"
              >
                <p className="text-foreground mb-2 inline-flex items-center gap-1.5 text-sm font-semibold">
                  <User className="text-muted-foreground h-3.5 w-3.5" />
                  Voyageur {idx + 2}
                </p>
                <div className="grid gap-2 md:grid-cols-2">
                  <div>
                    <Label htmlFor={`first-${idx + 1}`} className="text-xs">Prénom</Label>
                    <Input
                      id={`first-${idx + 1}`}
                      value={t.firstName}
                      onChange={(e) =>
                        updateTraveler(idx + 1, { firstName: e.target.value })
                      }
                      placeholder="Prénom"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor={`last-${idx + 1}`} className="text-xs">Nom</Label>
                    <Input
                      id={`last-${idx + 1}`}
                      value={t.lastName}
                      onChange={(e) =>
                        updateTraveler(idx + 1, { lastName: e.target.value })
                      }
                      placeholder="Nom"
                      className="mt-1"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div>
              <Label htmlFor="matricule" className="text-xs">
                Matricule fiscale de l&apos;agence (optionnel)
              </Label>
              <div className="relative mt-1">
                <Hash className="text-muted-foreground absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2" />
                <Input
                  id="matricule"
                  value={matricule}
                  onChange={(e) => setMatricule(e.target.value)}
                  placeholder="Ex : 1399210Z/A/M/002"
                  className="pl-9"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="internal-ref" className="text-xs">
                Référence interne (optionnel)
              </Label>
              <Input
                id="internal-ref"
                value={internalRef}
                onChange={(e) => setInternalRef(e.target.value)}
                placeholder="Votre numéro de dossier"
                className="mt-1"
              />
            </div>
          </div>
        </section>

        {/* Étape 2 — Paiement */}
        <section className="bg-card border-border/60 shadow-e2b-soft rounded-2xl border p-4 md:p-5">
          <header className="mb-3 flex items-center gap-2">
            <div className="bg-secondary/15 text-secondary flex h-9 w-9 items-center justify-center rounded-xl">
              <Wallet className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-foreground text-base font-semibold">
                Option de paiement
              </h2>
              <p className="text-muted-foreground text-xs">
                Sélectionnez le mode de règlement pour ce dossier.
              </p>
            </div>
          </header>

          {payment === null ? (
            <div className="mb-3 inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <AlertTriangle className="h-3.5 w-3.5" />
              Veuillez choisir votre option de paiement
            </div>
          ) : null}

          <div className="grid gap-2 md:grid-cols-2">
            {PAYMENT_OPTIONS.map((opt) => {
              const Icon = opt.icon
              const active = payment === opt.id
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setPayment(opt.id)}
                  className={cn(
                    "border-border/50 hover:border-primary/30 hover:bg-muted/30 flex items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                    active &&
                      "border-primary bg-primary/5 ring-primary/30 ring-2",
                  )}
                  aria-pressed={active}
                >
                  <div
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-lg",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-foreground text-sm font-semibold">
                      {opt.label}
                    </div>
                    <div className="text-muted-foreground text-xs leading-tight">
                      {opt.description}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </section>
      </div>

      {/* Récap latéral sticky */}
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="bg-card border-border/60 shadow-e2b-soft space-y-4 rounded-2xl border p-4">
          <h2 className="text-foreground inline-flex items-center gap-2 text-sm font-semibold tracking-wide uppercase">
            <ChevronDown className="text-primary h-4 w-4" />
            Récapitulatif
          </h2>

          <div>
            <p className="text-foreground text-sm font-semibold">
              {context.hotel.name}
            </p>
            <p className="text-muted-foreground text-xs">
              {context.hotel.zone ?? context.hotel.city}
            </p>
            {search.checkin && search.checkout ? (
              <p className="text-muted-foreground mt-1 text-xs">
                {search.checkin} → {search.checkout}
                {search.nights ? ` (${search.nights} nuits)` : ""}
              </p>
            ) : null}
          </div>

          <ul className="border-border/50 space-y-2 border-t pt-3 text-xs">
            {context.offers.map((sel) => (
              <li key={sel.offer.id} className="flex flex-col gap-1">
                <span className="text-foreground font-medium">
                  {sel.qty}× {sel.offer.category.name}
                </span>
                <span className="text-muted-foreground">
                  {sel.offer.arrangement.label} ·{" "}
                  <span title={BOARDING_LABEL[sel.offer.boarding]}>
                    {BOARDING_SHORT[sel.offer.boarding]}{" "}
                    {BOARDING_LABEL[sel.offer.boarding]}
                  </span>
                </span>
                <span className="text-foreground/80 self-end tabular-nums">
                  {formatTND(sel.offer.price * sel.qty)}
                </span>
              </li>
            ))}
          </ul>

          <div className="border-border/50 space-y-1.5 border-t pt-3 text-sm">
            <Row label="Total TTC" value={formatTND(finalTotal)} strong />
            <p className="text-muted-foreground text-[10px]">
              Montant estimatif après marge — le prix définitif est confirmé et
              débité par le serveur à l&apos;enregistrement.
            </p>
          </div>

          {submitError ? (
            <div className="bg-destructive/10 border-destructive/30 text-destructive flex items-start gap-2 rounded-xl border px-3 py-2 text-xs">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {submitError}
            </div>
          ) : null}

          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit || pending}
            size="lg"
            className="w-full rounded-xl"
          >
            {pending ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                Enregistrement…
              </>
            ) : (
              <>
                Confirmer la réservation
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </>
            )}
          </Button>
          {!mainTravelerValid ? (
            <p className="text-muted-foreground text-center text-[11px]">
              Renseignez tous les champs du voyageur principal.
            </p>
          ) : payment === null ? (
            <p className="text-muted-foreground text-center text-[11px]">
              Choisissez un mode de paiement pour continuer.
            </p>
          ) : null}
        </div>
      </aside>
    </div>
  )
}

function Row({
  label,
  value,
  strong,
  positive,
}: {
  label: string
  value: string
  strong?: boolean
  positive?: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "tabular-nums",
          strong ? "text-primary text-base font-bold" : "text-foreground/80",
          positive && "font-semibold text-emerald-600",
        )}
      >
        {value}
      </span>
    </div>
  )
}
