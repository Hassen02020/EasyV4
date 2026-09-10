/**
 * SERP Hôtels du portail B2B — Phase 8.
 *
 * Branché sur le vrai moteur myGo (`lib/mygo/search-core.ts::runHotelSearch`,
 * le même moteur partagé que `/hotels/search` B2C — voir
 * EASYV4_B2B_HOTELS_PHASE8_REPORT.md) au lieu du catalogue fixture
 * (`lib/pro/hotels-fixture.ts`, désormais orphelin de cette page — ni
 * supprimé ni modifié, voir le rapport pour ce qui en dépend encore).
 *
 * Recherche myGo réelle nécessite une ville précise (`cityId`) — les
 * destinations "chaîne hôtelière" / "région" / "toute la Tunisie" du
 * sélecteur existant ne correspondent à aucun `cityId` unique et ne sont
 * donc pas supportées ici (un visiteur qui les choisit voit un message
 * l'invitant à préciser une ville, pas un résultat vide ou inventé).
 */

import { findDestinationById } from "@/lib/pro/destinations"
import {
  HotelSearchQuerySchema,
  validateSearchDateRange,
} from "@/lib/mygo/search-core"
import { applyMarginToHotelOffer } from "@/lib/pro/pricing"
import { getActivePartnerMargins } from "@/lib/pro/server-context"
import { resolvePartnerMyGoAccess } from "@/lib/hotel-suppliers/tenant/live-resolution"
import { runSearchThroughHub, logHubSearchObservability } from "@/lib/hotel-suppliers/search-hub"
import {
  filtersFromSearchParams,
  type HotelFilterState,
} from "@/lib/mygo/facets"
import { isHotelSortMode, DEFAULT_SORT_MODE } from "@/lib/mygo/sort"
import { ProHotelResults } from "@/components/pro/pro-hotel-results"

export const metadata = {
  title: "Résultats hôtels — Espace Pro Easy2Book",
  description: "Liste des hôtels disponibles via le portail B2B Easy2Book",
}

export const dynamic = "force-dynamic"

type SerpSearchParams = Record<string, string | undefined>

function PromptState({ message }: { message: string }) {
  return (
    <div className="bg-card shadow-e2b-soft border-border/60 mx-auto max-w-2xl rounded-2xl border p-10 text-center">
      <p className="text-foreground text-base font-semibold">Recherche incomplète</p>
      <p className="text-muted-foreground mt-1 text-sm">{message}</p>
    </div>
  )
}

function ErrorState({ title, message }: { title: string; message?: string }) {
  return (
    <div className="border-destructive/40 bg-destructive/5 text-destructive mx-auto max-w-2xl rounded-2xl border p-6 text-sm">
      <p className="font-semibold">{title}</p>
      {message && <p className="mt-1">{message}</p>}
    </div>
  )
}

export default async function ProHotelsSerpPage({
  searchParams,
}: {
  searchParams: Promise<SerpSearchParams>
}) {
  const params = await searchParams
  const destination = params.destination
    ? findDestinationById(params.destination)
    : undefined

  const cityIdParam =
    params.cityId && /^\d+$/.test(params.cityId)
      ? params.cityId
      : destination?.kind === "city" && destination.cityId
        ? String(destination.cityId)
        : undefined

  const destinationLabel =
    params.destinationLabel ?? destination?.label ?? "Toute la Tunisie"

  const wrapperClass = "mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-10"

  if (!cityIdParam) {
    return (
      <div className={wrapperClass}>
        <PromptState
          message={
            destination && destination.kind !== "city"
              ? `"${destination.label}" regroupe plusieurs villes — la recherche myGo nécessite une ville précise. Choisissez une ville dans la liste.`
              : "Sélectionnez une ville, des dates de séjour et le nombre de voyageurs pour lancer la recherche."
          }
        />
      </div>
    )
  }

  const parsed = HotelSearchQuerySchema.safeParse({
    cityId: cityIdParam,
    checkin: params.checkin,
    checkout: params.checkout,
    adults: params.adults,
    children: params.children,
    rooms: params.rooms,
  })

  if (!parsed.success) {
    return (
      <div className={wrapperClass}>
        <PromptState message="Dates de séjour manquantes ou invalides — sélectionnez une arrivée et un départ." />
      </div>
    )
  }

  const q = parsed.data
  const dateCheck = validateSearchDateRange(q.checkin, q.checkout)
  if (!dateCheck.ok) {
    return (
      <div className={wrapperClass}>
        <PromptState message={dateCheck.message ?? "Dates de séjour invalides."} />
      </div>
    )
  }

  // PHASE 27.1 — compte fournisseur MyGo résolu pour l'agence de la session
  // partenaire courante (jamais le compte global MYGO_* si un compte tenant
  // est configuré) — voir lib/hotel-suppliers/tenant/live-resolution.ts.
  const [access, margins] = await Promise.all([
    resolvePartnerMyGoAccess(),
    getActivePartnerMargins(),
  ])
  // PHASE 28 — même orchestration Hub que /api/hotels/search — un seul
  // appel réseau myGo, résultat déjà autoritaire réutilisé pour
  // l'observabilité (voir lib/hotel-suppliers/search-hub.ts).
  const { runResult: result, hubResult } = await runSearchThroughHub(q, access)
  logHubSearchObservability(hubResult, { supplierAccountId: access.accountId })

  if (!result.ok) {
    const title =
      result.error === "rate_limited"
        ? "Trop de recherches en peu de temps"
        : "Le service hôtelier est temporairement indisponible"
    return (
      <div className={wrapperClass}>
        <ErrorState title={title} message={result.message} />
      </div>
    )
  }

  const offers = result.dto.offers.map((o) => applyMarginToHotelOffer(o, margins))
  const currency = offers[0]?.currency ?? "TND"

  const urlParams = new URLSearchParams(
    Object.entries(params).filter((e): e is [string, string] => typeof e[1] === "string"),
  )
  const initialFilters: HotelFilterState = filtersFromSearchParams(urlParams)
  const sortParam = urlParams.get("sort")
  const initialSortMode = isHotelSortMode(sortParam) ? sortParam : DEFAULT_SORT_MODE

  let nights: number | undefined
  try {
    nights = Math.max(
      1,
      Math.round(
        (Date.parse(q.checkout) - Date.parse(q.checkin)) / 86_400_000,
      ),
    )
  } catch {
    nights = undefined
  }

  return (
    <div className={wrapperClass}>
      {result.degraded && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          Résultats affichés depuis un cache récent — le fournisseur hôtelier
          est momentanément indisponible, les prix et disponibilités seront
          revérifiés avant toute réservation.
        </div>
      )}
      <ProHotelResults
        offers={offers}
        currency={currency}
        initialFilters={initialFilters}
        initialSortMode={initialSortMode}
        context={{
          destinationLabel,
          checkin: q.checkin,
          checkout: q.checkout,
          nights,
          adults: q.adults,
          children: q.children.length,
          cityId: q.cityId,
          childrenAges: q.children,
        }}
      />
    </div>
  )
}
