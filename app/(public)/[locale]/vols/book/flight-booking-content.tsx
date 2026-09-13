"use client"

/**
 * Contenu client de /vols/book — lit l'offre sélectionnée depuis les query
 * params posés par `FlightCard` (app/vols/search/flight-results-content.tsx)
 * et affiche `FlightGuestBookingForm`.
 *
 * Pourquoi des query params plutôt qu'un store client (cart/sessionStorage) :
 * l'offre est un objet éphémère signé par le serveur (`offerToken`, TTL 15
 * min) — les champs d'affichage (horaires/carrier/prix) sont dupliqués ici
 * uniquement pour l'UI, jamais utilisés comme source de vérité côté
 * serveur : `lib/vols/guest-booking-actions.ts` ne fait confiance qu'au
 * token pour reconstruire route/prix/disponibilité.
 */

import { Link } from "@/i18n/navigation"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import {
  FlightGuestBookingForm,
  type FlightBookingOfferSummary,
} from "@/components/flights/flight-guest-booking-form"

function parseOfferFromParams(params: URLSearchParams): FlightBookingOfferSummary | null {
  const token = params.get("token")
  const price = Number(params.get("price"))
  const origin = params.get("origin")
  const destination = params.get("destination")
  const departureAt = params.get("departureAt")
  const arrivalAt = params.get("arrivalAt")
  if (!token || !origin || !destination || !departureAt || !arrivalAt || !Number.isFinite(price) || price <= 0) {
    return null
  }
  return {
    offerToken: token,
    priceTnd: price,
    currency: params.get("currency") ?? "TND",
    origin,
    destination,
    departureAt,
    arrivalAt,
    carrier: params.get("carrier") ?? "",
    flightNumber: params.get("flightNumber") ?? "",
    stops: Number(params.get("stops") ?? "0"),
    cabin: params.get("cabin") ?? "ECONOMY",
    adults: Math.max(1, Number(params.get("adults") ?? "1")),
    children: Math.max(0, Number(params.get("children") ?? "0")),
    refundable: params.get("refundable") === "true",
    baggageKg: params.get("baggageKg") ? Number(params.get("baggageKg")) : null,
  }
}

export function FlightBookingContent() {
  const searchParams = useSearchParams()
  const t = useTranslations("Vols")
  const offer = parseOfferFromParams(searchParams)

  if (!offer) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12">
        <div className="border-destructive/40 bg-destructive/5 text-destructive rounded-lg border p-6 text-sm">
          <p className="font-semibold">{t("offerNotFoundTitle")}</p>
          <p className="mt-1">
            {t("offerNotFoundDesc")}
          </p>
          <Button asChild variant="outline" className="mt-3">
            <Link href="/vols">{t("backToSearch")}</Link>
          </Button>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-foreground mb-6 text-xl font-bold">{t("finalizeBookingTitle")}</h1>
      <FlightGuestBookingForm offer={offer} />
    </main>
  )
}
