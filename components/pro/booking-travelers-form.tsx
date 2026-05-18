"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  ChevronDown,
  User,
  UserPlus,
  Hash,
  TicketPercent,
  AlertTriangle,
  Wallet,
  Banknote,
  Building2,
  CreditCard,
  CheckCircle2,
  Loader2,
  ArrowRight,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { BOARDING_LABEL, BOARDING_SHORT } from "@/lib/pro/hotels-fixture"
import { formatTND } from "@/lib/pro/format"
import {
  generateBookingRef,
  type BookingContext,
} from "@/lib/pro/booking-context"

type Traveler = {
  firstName: string
  lastName: string
  isMain: boolean
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

const VALID_COUPONS: Record<string, { label: string; discount: number }> = {
  EASY10: { label: "EASY10 — −10 %", discount: 0.1 },
  TUNISIA5: { label: "TUNISIA5 — −5 %", discount: 0.05 },
  WELCOME20: { label: "WELCOME20 — −20 %", discount: 0.2 },
}

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
  const [internalRef, setInternalRef] = useState("")
  const [matricule, setMatricule] = useState("")
  const [couponInput, setCouponInput] = useState("")
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string
    discount: number
    label: string
  } | null>(null)
  const [couponError, setCouponError] = useState<string | null>(null)
  const [payment, setPayment] = useState<PaymentMode | null>(null)
  const [editableTotal, setEditableTotal] = useState<number | null>(null)

  const baseTotal = context.subtotal
  const discountAmount = appliedCoupon ? baseTotal * appliedCoupon.discount : 0
  const totalAfterCoupon = baseTotal - discountAmount
  const finalTotal = editableTotal !== null ? editableTotal : totalAfterCoupon

  const mainTraveler = travelers[0]
  const mainTravelerValid = Boolean(
    mainTraveler?.firstName.trim() && mainTraveler?.lastName.trim(),
  )
  const canSubmit = mainTravelerValid && payment !== null

  function updateTraveler(index: number, patch: Partial<Traveler>) {
    setTravelers((prev) =>
      prev.map((t, i) => (i === index ? { ...t, ...patch } : t)),
    )
  }

  function applyCoupon() {
    const code = couponInput.trim().toUpperCase()
    if (!code) {
      setCouponError("Saisissez un code")
      return
    }
    const found = VALID_COUPONS[code]
    if (!found) {
      setCouponError("Coupon invalide ou expiré")
      setAppliedCoupon(null)
      return
    }
    setCouponError(null)
    setAppliedCoupon({ code, discount: found.discount, label: found.label })
  }

  function removeCoupon() {
    setAppliedCoupon(null)
    setCouponInput("")
    setCouponError(null)
  }

  function handleSubmit() {
    if (!canSubmit) return
    startTransition(() => {
      const ref = generateBookingRef()
      const params = new URLSearchParams()
      params.set("payment", payment!)
      params.set("total", String(Math.round(finalTotal * 1000) / 1000))
      params.set("hotelId", context.hotel.id)
      if (appliedCoupon) params.set("coupon", appliedCoupon.code)
      if (internalRef) params.set("ref", internalRef)
      router.push(`/pro/booking/confirmation/${ref}?${params.toString()}`)
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
            {travelers.map((t, idx) => (
              <div
                key={idx}
                className="border-border/50 rounded-xl border p-3 md:p-4"
              >
                <p className="text-foreground mb-2 inline-flex items-center gap-1.5 text-sm font-semibold">
                  {t.isMain ? (
                    <>
                      <UserPlus className="text-primary h-3.5 w-3.5" />
                      Voyageur principal
                      <span className="text-primary ml-1 text-xs">*</span>
                    </>
                  ) : (
                    <>
                      <User className="text-muted-foreground h-3.5 w-3.5" />
                      Voyageur {idx + 1}
                    </>
                  )}
                </p>
                <div className="grid gap-2 md:grid-cols-2">
                  <div>
                    <Label htmlFor={`first-${idx}`} className="text-xs">
                      Prénom{t.isMain ? " *" : ""}
                    </Label>
                    <Input
                      id={`first-${idx}`}
                      value={t.firstName}
                      onChange={(e) =>
                        updateTraveler(idx, { firstName: e.target.value })
                      }
                      placeholder="Prénom"
                      required={t.isMain}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor={`last-${idx}`} className="text-xs">
                      Nom{t.isMain ? " *" : ""}
                    </Label>
                    <Input
                      id={`last-${idx}`}
                      value={t.lastName}
                      onChange={(e) =>
                        updateTraveler(idx, { lastName: e.target.value })
                      }
                      placeholder="Nom"
                      required={t.isMain}
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

        {/* Étape 2 — Coupon */}
        <section className="bg-card border-border/60 shadow-e2b-soft rounded-2xl border p-4 md:p-5">
          <header className="mb-3 flex items-center gap-2">
            <div className="bg-accent/15 text-accent flex h-9 w-9 items-center justify-center rounded-xl">
              <TicketPercent className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-foreground text-base font-semibold">
                Coupon de Réduction
              </h2>
              <p className="text-muted-foreground text-xs">
                Codes valides en démo : EASY10 · TUNISIA5 · WELCOME20
              </p>
            </div>
          </header>

          {appliedCoupon ? (
            <div className="border-accent/40 bg-accent/10 flex items-center justify-between gap-3 rounded-xl border px-3 py-2">
              <div className="inline-flex items-center gap-2 text-sm">
                <CheckCircle2 className="text-accent h-4 w-4" />
                <span className="text-foreground font-semibold">
                  {appliedCoupon.label}
                </span>
                <span className="text-muted-foreground">
                  −{formatTND(discountAmount)}
                </span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={removeCoupon}
              >
                Retirer
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Label htmlFor="coupon" className="text-xs">
                  Code promo
                </Label>
                <Input
                  id="coupon"
                  value={couponInput}
                  onChange={(e) => {
                    setCouponInput(e.target.value)
                    setCouponError(null)
                  }}
                  placeholder="Ex : EASY10"
                  className="mt-1 uppercase"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={applyCoupon}
                className="rounded-xl"
              >
                Appliquer
              </Button>
            </div>
          )}
          {couponError ? (
            <p className="text-destructive mt-2 text-xs">{couponError}</p>
          ) : null}
        </section>

        {/* Étape 3 — Paiement */}
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
              {context.hotel.zone}
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
            <Row label="Sous-total" value={formatTND(baseTotal)} />
            {appliedCoupon ? (
              <Row
                label={`Réduction (${appliedCoupon.code})`}
                value={`−${formatTND(discountAmount)}`}
                positive
              />
            ) : null}
            <Row label="Total TTC" value={formatTND(finalTotal)} strong />
            <details className="text-muted-foreground pt-1 text-xs">
              <summary className="hover:text-foreground cursor-pointer">
                Ajuster le total (avec marge agence)
              </summary>
              <div className="mt-2 flex items-center gap-2">
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.001"
                  value={
                    editableTotal !== null ? editableTotal : totalAfterCoupon
                  }
                  onChange={(e) =>
                    setEditableTotal(Number.parseFloat(e.target.value) || 0)
                  }
                  className="h-8 text-xs"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditableTotal(null)}
                >
                  Réinitialiser
                </Button>
              </div>
              <p className="mt-1 text-[10px]">
                Permet de saisir manuellement le total client après marge — sera
                remplacé par lecture <code>pricing_margins</code> en phase 9.
              </p>
            </details>
          </div>

          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || pending}
            size="lg"
            className="w-full rounded-xl"
          >
            {pending ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                Confirmation…
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
              Renseignez le voyageur principal pour continuer.
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
