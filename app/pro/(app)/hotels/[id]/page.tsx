/**
 * Détail hôtel B2B — Phase 9.
 *
 * Branché sur le vrai moteur myGo (comme la SERP, Phase 8) au lieu du
 * fixture (`lib/pro/hotels-fixture.ts`, `getProHotelById` — désormais
 * orphelin de cette page, ni supprimé ni modifié). Réutilise `runHotelSearch`
 * scopé à un seul hôtel (`HotelSearchInput.hotelId`, déjà supporté par le
 * connecteur myGo — voir lib/mygo/client.ts) : cet appel sert aussi de
 * première revalidation (prix/disponibilité rafraîchis par rapport à la
 * SERP), la revalidation finale et autoritaire restant BookingCreation
 * lui-même (lib/booking/hotel-provider-booking.ts, inchangé).
 */

import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  HotelSearchQuerySchema,
  validateSearchDateRange,
  runHotelSearch,
} from "@/lib/mygo/search-core"
import { applyMarginToHotelOffer } from "@/lib/pro/pricing"
import { getActivePartnerMargins } from "@/lib/pro/server-context"
import { resolvePartnerMyGoAccess } from "@/lib/hotel-suppliers/tenant/live-resolution"
import { ProRoomSelector } from "@/components/pro/pro-room-selector"

type DetailSearchParams = {
  cityId?: string
  checkin?: string
  checkout?: string
  adults?: string
  children?: string
}

export const dynamic = "force-dynamic"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return { title: `Hôtel ${id} — Espace Pro Easy2Book` }
}

export default async function ProHotelDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<DetailSearchParams>
}) {
  const { id } = await params
  const search = await searchParams

  if (!/^\d+$/.test(id)) notFound()
  if (!search.cityId || !search.checkin || !search.checkout) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <div className="bg-card shadow-e2b-soft border-border/60 rounded-2xl border p-8 text-center">
          <p className="text-foreground text-base font-semibold">Recherche incomplète</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Ville et dates de séjour requises pour afficher cet hôtel.
          </p>
          <Button asChild variant="outline" className="mt-4 rounded-xl">
            <Link href="/pro/hotels">Retour à la recherche</Link>
          </Button>
        </div>
      </div>
    )
  }

  const parsed = HotelSearchQuerySchema.safeParse({
    cityId: search.cityId,
    checkin: search.checkin,
    checkout: search.checkout,
    adults: search.adults,
    children: search.children,
    hotelId: id,
  })
  if (!parsed.success) notFound()

  const q = parsed.data
  const dateCheck = validateSearchDateRange(q.checkin, q.checkout)
  if (!dateCheck.ok) notFound()

  // PHASE 27.1 — compte fournisseur MyGo résolu pour l'agence de la session
  // partenaire courante (voir lib/hotel-suppliers/tenant/live-resolution.ts).
  const [access, margins] = await Promise.all([
    resolvePartnerMyGoAccess(),
    getActivePartnerMargins(),
  ])
  const result = await runHotelSearch(q, access.client ? { client: access.client } : undefined)

  if (!result.ok || result.dto.offers.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <div className="border-destructive/40 bg-destructive/5 text-destructive rounded-2xl border p-8 text-center text-sm">
          <p className="font-semibold">
            {!result.ok
              ? "Le service hôtelier est temporairement indisponible"
              : "Cet hôtel n'est plus disponible pour ces dates"}
          </p>
          {!result.ok && result.message && <p className="mt-1">{result.message}</p>}
          {/* PHASE 30.4 — audit : `q` (recherche déjà validée à ce stade)
              était disponible mais pas réutilisé ; "Retour aux résultats"
              renvoyait vers /pro/hotels SANS aucun paramètre, forçant
              l'agent à ressaisir toute la recherche au lieu de simplement
              revoir les résultats pour les mêmes ville/dates/voyageurs. */}
          <Button asChild variant="outline" className="mt-4 rounded-xl">
            <Link
              href={`/pro/hotels?cityId=${q.cityId}&checkin=${q.checkin}&checkout=${q.checkout}&adults=${q.adults}${search.children ? `&children=${search.children}` : ""}`}
            >
              Retour aux résultats
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  const offer = applyMarginToHotelOffer(result.dto.offers[0]!, margins)

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-10">
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm" className="rounded-xl">
          <Link
            href={`/pro/hotels?cityId=${q.cityId}&checkin=${q.checkin}&checkout=${q.checkout}&adults=${q.adults}${q.children.length ? `&children=${q.children.join(",")}` : ""}`}
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Retour aux résultats
          </Link>
        </Button>
      </div>

      <div className="space-y-5">
        <header className="bg-card border-border/60 shadow-e2b-soft rounded-2xl border p-5">
          <h1 className="text-foreground text-xl font-bold tracking-tight md:text-2xl">
            {offer.hotel.name}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {offer.hotel.cityName ?? "—"}
            {offer.hotel.stars ? ` · ${offer.hotel.stars} étoiles` : ""}
          </p>
        </header>

        <ProRoomSelector
          hotelId={id}
          offer={offer}
          searchQuery={{
            cityId: q.cityId,
            checkin: q.checkin,
            checkout: q.checkout,
            adults: q.adults,
            children: q.children,
          }}
        />
      </div>
    </div>
  )
}
