"use client"

/**
 * PassengerBookingForm — passenger collection + ancillary selection.
 *
 * Consumes a snapshotId (opaque UUID). The selling price is fetched
 * server-side via the snapshot; the client never receives the supplier price.
 * G7: ancillaries are listed for selection; only ancillaryIds are sent to the
 * server — the server resolves price from the snapshot itinerary.
 */

import { useState } from "react"
import { useRouter } from "@/i18n/navigation"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Checkbox } from "@/components/ui/checkbox"
import { Loader2, User, Plane, Clock, ShoppingBag, CreditCard, Banknote, Building2 } from "lucide-react"
import { createFlightBookingRequest } from "@/lib/vols/booking-request-action"
import type { Ancillary } from "@/lib/vols/canonical"

export interface PassengerBookingFormProps {
  snapshotId: string
  passengerCount: number
  /** Display-only: selling price already stored in snapshot. */
  sellingAmountDisplay: string
  sellingCurrency: string
  /** Display-only: itinerary summary for the UI. */
  routeDisplay: string
  departureDisplay: string
  slaMinutes?: number
  /** G7: ancillary catalog from the offer (prices are authoritative server-side). */
  availableAncillaries?: Ancillary[]
}

interface PassengerFields {
  firstName: string
  lastName: string
  birthDate: string
  nationality: string
  passportNumber: string
  passportExpiry: string
}

interface ContactFields {
  email: string
  phone: string
  firstName: string
  lastName: string
}

function emptyPassenger(): PassengerFields {
  return { firstName: "", lastName: "", birthDate: "", nationality: "", passportNumber: "", passportExpiry: "" }
}

function emptyContact(): ContactFields {
  return { email: "", phone: "", firstName: "", lastName: "" }
}

const ANCILLARY_TYPE_LABELS: Record<string, string> = {
  BAGGAGE: "Bagages",
  SEAT: "Siège",
  MEAL: "Repas",
  LOUNGE: "Salon",
  INSURANCE: "Assurance",
  PRIORITY: "Prioritaire",
  OTHER: "Autre",
}

export function PassengerBookingForm({
  snapshotId,
  passengerCount,
  sellingAmountDisplay,
  sellingCurrency,
  routeDisplay,
  departureDisplay,
  availableAncillaries = [],
}: PassengerBookingFormProps) {
  const router = useRouter()
  const t = useTranslations("Vols")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [passengers, setPassengers] = useState<PassengerFields[]>(
    Array.from({ length: Math.max(1, passengerCount) }, emptyPassenger),
  )
  const [contact, setContact] = useState<ContactFields>(emptyContact)
  const [paymentMethod, setPaymentMethod] = useState<"transfer" | "cash">("transfer")
  // G7: set of selected ancillaryIds
  const [selectedAncillaryIds, setSelectedAncillaryIds] = useState<Set<string>>(new Set())

  function updatePassenger(i: number, field: keyof PassengerFields, value: string) {
    setPassengers((prev) => prev.map((p, j) => (j === i ? { ...p, [field]: value } : p)))
  }

  function toggleAncillary(ancillaryId: string) {
    setSelectedAncillaryIds((prev) => {
      const next = new Set(prev)
      if (next.has(ancillaryId)) next.delete(ancillaryId)
      else next.add(ancillaryId)
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const result = await createFlightBookingRequest({
        snapshotId,
        passengers: passengers.map((p) => ({
          passengerType: "ADT" as const,
          firstName: p.firstName,
          lastName: p.lastName,
          birthDate: p.birthDate || undefined,
          nationality: p.nationality || undefined,
          passportNumber: p.passportNumber || undefined,
          passportExpiry: p.passportExpiry || undefined,
        })),
        contact: {
          email: contact.email,
          phone: contact.phone || undefined,
          firstName: contact.firstName,
          lastName: contact.lastName,
        },
        paymentMethod,
        // G7: only identifiers — no price from the browser
        ancillaries: selectedAncillaryIds.size > 0
          ? Array.from(selectedAncillaryIds).map((ancillaryId) => ({ ancillaryId }))
          : undefined,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.push(`/vols/confirmation/${result.publicRef}`)
    } catch {
      setError(t("unknownError"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Flight summary (display only — never trust client-side price) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Plane className="h-4 w-4 text-sky-700" />
            {t("yourFlightTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p className="font-medium">{routeDisplay}</p>
          <p className="text-muted-foreground">{departureDisplay}</p>
          <p className="mt-2 text-lg font-bold text-sky-700">
            {sellingAmountDisplay} {sellingCurrency}
          </p>
        </CardContent>
      </Card>

      {/* Contact */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("mainContactTag")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="contact-fn">{t("firstNameLabel")}</Label>
            <Input
              id="contact-fn"
              required
              value={contact.firstName}
              onChange={(e) => setContact((c) => ({ ...c, firstName: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="contact-ln">{t("lastNameLabel")}</Label>
            <Input
              id="contact-ln"
              required
              value={contact.lastName}
              onChange={(e) => setContact((c) => ({ ...c, lastName: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="contact-email">{t("emailLabel")}</Label>
            <Input
              id="contact-email"
              type="email"
              required
              value={contact.email}
              onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="contact-phone">{t("phoneLabel")}</Label>
            <Input
              id="contact-phone"
              type="tel"
              value={contact.phone}
              onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value }))}
            />
          </div>
        </CardContent>
      </Card>

      {/* Passengers */}
      {passengers.map((pax, i) => (
        <Card key={i}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="h-4 w-4" />
              {t("travelerTitle", { n: i + 1 })}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>{t("firstNameLabel")}</Label>
              <Input
                required
                value={pax.firstName}
                onChange={(e) => updatePassenger(i, "firstName", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>{t("lastNameLabel")}</Label>
              <Input
                required
                value={pax.lastName}
                onChange={(e) => updatePassenger(i, "lastName", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>{t("birthDateLabel")}</Label>
              <Input
                type="date"
                value={pax.birthDate}
                onChange={(e) => updatePassenger(i, "birthDate", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>{t("nationalityLabel")}</Label>
              <Input
                maxLength={2}
                placeholder="TN"
                value={pax.nationality}
                onChange={(e) => updatePassenger(i, "nationality", e.target.value.toUpperCase())}
              />
            </div>
            <div className="space-y-1">
              <Label>{t("passportOrCinLabel")}</Label>
              <Input
                value={pax.passportNumber}
                onChange={(e) => updatePassenger(i, "passportNumber", e.target.value)}
              />
            </div>
          </CardContent>
        </Card>
      ))}

      {/* G7 — Ancillary selection */}
      {availableAncillaries.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShoppingBag className="h-4 w-4 text-sky-700" />
              Services supplémentaires
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {availableAncillaries.map((anc) => {
              const checked = selectedAncillaryIds.has(anc.ancillaryId)
              const typeLabel = ANCILLARY_TYPE_LABELS[anc.type] ?? anc.type
              return (
                <div
                  key={anc.ancillaryId}
                  className="flex items-start gap-3 rounded-md border p-3 transition-colors data-[checked=true]:border-sky-300 data-[checked=true]:bg-sky-50 dark:data-[checked=true]:border-sky-700 dark:data-[checked=true]:bg-sky-950/30"
                  data-checked={checked}
                >
                  <Checkbox
                    id={`anc-${anc.ancillaryId}`}
                    checked={checked}
                    onCheckedChange={() => toggleAncillary(anc.ancillaryId)}
                    className="mt-0.5"
                  />
                  <label
                    htmlFor={`anc-${anc.ancillaryId}`}
                    className="flex flex-1 cursor-pointer items-start justify-between gap-2"
                  >
                    <span className="space-y-0.5">
                      <span className="block text-sm font-medium">{anc.description}</span>
                      <span className="text-muted-foreground block text-xs">{typeLabel}</span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold text-sky-700">
                      +{anc.amount.toLocaleString("fr-TN", { minimumFractionDigits: 3 })} {anc.currency}
                    </span>
                  </label>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* Payment method */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-4 w-4 text-sky-700" />
            {t("paymentMethodTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${paymentMethod === "transfer" ? "border-sky-300 bg-sky-50 dark:border-sky-700 dark:bg-sky-950/30" : "hover:bg-muted/50"}`}
          >
            <input
              type="radio"
              name="paymentMethod"
              value="transfer"
              checked={paymentMethod === "transfer"}
              onChange={() => setPaymentMethod("transfer")}
              className="mt-0.5 accent-sky-700"
            />
            <span className="space-y-0.5">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <Building2 className="h-3.5 w-3.5 text-sky-700" />
                {t("methodTransfer")}
              </span>
              <span className="text-muted-foreground block text-xs">{t("methodTransferDesc")}</span>
            </span>
          </label>
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${paymentMethod === "cash" ? "border-sky-300 bg-sky-50 dark:border-sky-700 dark:bg-sky-950/30" : "hover:bg-muted/50"}`}
          >
            <input
              type="radio"
              name="paymentMethod"
              value="cash"
              checked={paymentMethod === "cash"}
              onChange={() => setPaymentMethod("cash")}
              className="mt-0.5 accent-sky-700"
            />
            <span className="space-y-0.5">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <Banknote className="h-3.5 w-3.5 text-sky-700" />
                {t("methodCash")}
              </span>
              <span className="text-muted-foreground block text-xs">{t("methodCashDesc")}</span>
            </span>
          </label>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* SLA notice */}
      <p className="text-muted-foreground flex items-center gap-2 text-xs">
        <Clock className="h-3 w-3 shrink-0" />
        {t.rich("confirmationSlaNotice", {
          minutes: t("confirmationSlaMinutes"),
          strong: (chunks) => <strong>{chunks}</strong>,
        })}
      </p>

      <Button
        type="submit"
        disabled={submitting}
        className="w-full bg-sky-700 hover:bg-sky-800 text-white"
        size="lg"
      >
        {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        {submitting ? t("processing") : t("requestTicketButton")}
      </Button>
    </form>
  )
}
