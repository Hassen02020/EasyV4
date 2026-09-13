"use client"

/**
 * Contenu client de /hotels-monde/book — lit l'offre sélectionnée depuis
 * les query params posés par `HotelCard`
 * (app/hotels-monde/search/world-hotel-results-content.tsx) et affiche
 * `WorldHotelGuestBookingForm`.
 *
 * Pourquoi des query params plutôt qu'un store client (cart/sessionStorage) :
 * l'offre est un objet éphémère signé par le serveur (`offerToken`, TTL 15
 * min) — les champs d'affichage (nom/dates/prix) sont dupliqués ici
 * uniquement pour l'UI, jamais utilisés comme source de vérité côté
 * serveur : `lib/hotels-monde/guest-booking-actions.ts` ne fait confiance
 * qu'au token pour reconstruire l'hôtel/prix/disponibilité.
 */

import { Link } from "@/i18n/navigation"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import {
  WorldHotelGuestBookingForm,
  type WorldHotelBookingOfferSummary,
} from "@/components/hotels-monde/world-hotel-guest-booking-form"

function parseOfferFromParams(params: URLSearchParams): WorldHotelBookingOfferSummary | null {
  const token = params.get("token")
  const price = Number(params.get("price"))
  const name = params.get("name")
  const city = params.get("city")
  const checkIn = params.get("checkIn")
  const checkOut = params.get("checkOut")
  if (!token || !name || !city || !checkIn || !checkOut || !Number.isFinite(price) || price <= 0) {
    return null
  }
  return {
    offerToken: token,
    priceTnd: price,
    currency: params.get("currency") ?? "TND",
    name,
    city,
    country: params.get("country") ?? "",
    checkIn,
    checkOut,
    nights: Math.max(1, Number(params.get("nights") ?? "1")),
    adults: Math.max(1, Number(params.get("adults") ?? "1")),
    rooms: Math.max(1, Number(params.get("rooms") ?? "1")),
    refundable: params.get("refundable") === "true",
    breakfastIncluded: params.get("breakfastIncluded") === "true",
    stars: params.get("stars") ? Number(params.get("stars")) : null,
  }
}

export function WorldHotelBookingContent() {
  const searchParams = useSearchParams()
  const t = useTranslations("HotelsMonde")
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
            <Link href="/hotels-monde">{t("backToSearch")}</Link>
          </Button>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-foreground mb-6 text-xl font-bold">{t("finalizeBookingTitle")}</h1>
      <WorldHotelGuestBookingForm offer={offer} />
    </main>
  )
}
