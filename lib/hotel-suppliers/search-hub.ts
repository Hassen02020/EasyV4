/**
 * PHASE 28 — point d'entrée Hub pour la recherche hôtel de PRODUCTION.
 *
 * Cible de la mission : REQUEST → TENANT CONTEXT → SUPPLIER ACCOUNT
 * RESOLUTION → AVAILABLE SUPPLIER DRIVERS → PARALLEL SEARCH → TIMEOUT
 * ISOLATION → NORMALIZATION → MAPPING → DEDUPLICATION → RANKING → EXISTING
 * HOTEL RESULT CONTRACT → CUSTOMER.
 *
 * Décision d'architecture documentée (preuve concrète, pas une supposition) :
 * la réponse HTTP continue de sortir de `runHotelSearch()`/`HotelOfferDTO`
 * (lib/mygo/search-core.ts), PAS d'une reconstruction depuis
 * `NormalizedHotel`/`NormalizedRate`. Reconstruire perdrait des champs
 * réellement utilisés en production :
 *   - `RoomOfferDTO.cancellationPolicies[]` (plusieurs paliers) est réduit à
 *     UNE SEULE `NormalizedCancellationPolicy` par
 *     `mapMyGoOfferToRates`/`toCancellationPolicy` — components/pro/
 *     pro-room-selector.tsx lit pourtant `cancellationPolicies.some(...)`
 *     sur PLUSIEURS paliers.
 *   - `HotelOfferDTO.recommended` n'a pas d'équivalent Normalized — utilisé
 *     pour le tri/filtre "recommandés" dans hotel-card.tsx (B2C) et
 *     pro-hotel-results.tsx (B2B).
 *   - `basePrice`/`photo`/`description`/`quantity` par chambre n'existent
 *     pas côté Normalized (contrat Hub volontairement provider-neutre).
 * Élargir le contrat Hub pour porter ces champs spécifiques myGo, ou les
 * perdre silencieusement, sont tous deux hors périmètre ("smallest additive
 * change", "existing contract must remain stable unless a concrete
 * compatibility issue is proven" — la preuve ci-dessus va dans le sens
 * inverse : GARDER le contrat existant).
 *
 * Le Hub devient malgré tout l'orchestrateur RÉEL, exécuté à chaque requête,
 * pas une façade : `runHotelSearch()` n'est appelée QU'UNE SEULE FOIS (zéro
 * appel réseau myGo dupliqué — le cache 5min de MyGoClient.searchHotels()
 * rendrait un second appel quasi gratuit de toute façon, mais on l'évite
 * complètement), puis son résultat DÉJÀ récupéré est normalisé (mêmes
 * fonctions que MyGoDriver.search(), réutilisées) et passé à
 * `searchAcrossSuppliers()` aux côtés des 3 drivers DOCUMENTATION_REQUIRED —
 * qui exerce pour de vrai NORMALIZATION → MAPPING → DEDUPLICATION à chaque
 * requête. Le jour où un second fournisseur RÉEL existe, c'est ce même
 * chemin qui portera la fusion cross-fournisseur — pas une reconstruction
 * de dernière minute.
 */
import { NextResponse } from "next/server"
import {
  runHotelSearch,
  formatHotelSearchResponse,
  type HotelSearchQuery,
  type HotelSearchRunResult,
  type RunHotelSearchOverrides,
} from "@/lib/mygo/search-core"
import { logger } from "@/lib/logger"
import { mapMyGoHotelSummary, mapMyGoOfferToRates } from "./mygo/mapper"
import { searchAcrossSuppliers } from "./core/orchestration"
import { createTunisiaBedDriver } from "./tunisia-bed/driver"
import { createCyberesaDriver } from "./cyberesa/driver"
import { createThreeTDriver } from "./3t/driver"
import type { HotelSupplierDriver, SupplierSearchResult } from "./core/supplier"
import type { HotelSearchRequest, HubSearchResult, SupplierName } from "./core/types"
import type { ResolvedMyGoAccess } from "./tenant/live-resolution"

/** Traduit la query déjà validée par le route handler vers le contrat Hub neutre — aucun champ inventé, un simple renommage/regroupement. */
export function buildHubSearchRequestFromQuery(q: HotelSearchQuery): HotelSearchRequest {
  const rooms = q.rooms ?? [{ adults: q.adults, childAges: q.children }]
  return {
    destinationId: String(q.cityId),
    checkIn: q.checkin,
    checkOut: q.checkout,
    rooms,
    currency: q.currency ?? "TND",
    stars: q.stars,
    // q.onlyAvailable est déjà un booléen résolu par HotelSearchQuerySchema
    // (jamais undefined) — passé tel quel, sans second défaut ici, pour
    // rester identique bit à bit au comportement déjà utilisé par
    // runRealHotelSearch() côté pipeline natif.
    onlyAvailable: q.onlyAvailable,
  }
}

export interface HubOrchestratedSearch {
  /** Autoritaire pour la réponse HTTP — inchangé, voir formatHotelSearchResponse(). */
  runResult: HotelSearchRunResult
  /** Observabilité + dédup/mapping/ranking réellement exercés — pas (encore) la source de la réponse tant qu'un seul fournisseur réel existe. */
  hubResult: HubSearchResult
}

/**
 * Exécute la recherche myGo tenant-résolue UNE SEULE FOIS puis fait passer
 * ce résultat déjà récupéré à travers `searchAcrossSuppliers()` (avec les 3
 * drivers DOCUMENTATION_REQUIRED, qui se signalent NOT_CONFIGURED sans
 * jamais être réellement appelés). `access` omis => comportement 100%
 * historique (compte global `MYGO_*`, démo-mode inclus, voir
 * lib/mygo/search-core.ts::isDemoMode()).
 */
export async function runSearchThroughHub(
  q: HotelSearchQuery,
  access?: ResolvedMyGoAccess,
  correlationId?: string,
): Promise<HubOrchestratedSearch> {
  const overrides: RunHotelSearchOverrides | undefined = access?.client ? { client: access.client } : undefined
  const runResult = await runHotelSearch(q, overrides)

  const hubRequest = buildHubSearchRequestFromQuery(q)
  const occupancy = {
    adults: hubRequest.rooms[0]?.adults ?? q.adults,
    childAges: hubRequest.rooms[0]?.childAges?.length ? hubRequest.rooms[0].childAges : undefined,
  }

  // Driver "passthrough" : ne refait JAMAIS l'appel réseau — normalise
  // simplement le résultat déjà récupéré ci-dessus. `getConfigStatus()`
  // renvoie toujours CONFIGURED : par construction, `runHotelSearch()` a
  // DÉJÀ produit un résultat (réel, démo, dégradé ou erreur) avant qu'on
  // atteigne ce point — il n'y a pas de notion de "myGo non configuré" côté
  // Hub ici, seulement "le résultat déjà obtenu est ok ou non" (voir
  // .search() ci-dessous, qui reflète fidèlement les deux cas). Renvoyer
  // NOT_CONFIGURED d'après `access.driver.getConfigStatus()` serait FAUX en
  // mode démo (credentials absentes mais fixture bien servie) : le driver
  // serait court-circuité par searchAcrossSuppliers() alors que des
  // résultats réels existent.
  const myGoPassthrough: HotelSupplierDriver = {
    supplier: "mygo",
    getConfigStatus: () => "CONFIGURED",
    search: async (): Promise<SupplierSearchResult> => {
      if (!runResult.ok) {
        throw new Error(runResult.message ?? runResult.error)
      }
      const hotels = runResult.dto.offers.map((o) => mapMyGoHotelSummary(o.hotel))
      const rates = runResult.dto.offers.flatMap((o) => mapMyGoOfferToRates(o, q.cityId, occupancy))
      return { hotels, rates }
    },
    getDetails: () => Promise.reject(new Error("myGoPassthrough: getDetails non utilisé pour l'orchestration de recherche")),
    checkRate: () => Promise.reject(new Error("myGoPassthrough: checkRate non utilisé pour l'orchestration de recherche")),
    book: () => Promise.reject(new Error("myGoPassthrough: book non utilisé pour l'orchestration de recherche")),
    getBooking: () => Promise.reject(new Error("myGoPassthrough: getBooking non utilisé pour l'orchestration de recherche")),
    cancel: () => Promise.reject(new Error("myGoPassthrough: cancel non utilisé pour l'orchestration de recherche")),
    reconcileBooking: () => Promise.resolve({ outcome: "UNSUPPORTED" }),
  }

  const drivers: HotelSupplierDriver[] = [
    myGoPassthrough,
    createTunisiaBedDriver(),
    createCyberesaDriver(),
    createThreeTDriver(),
  ]
  const hubResult = await searchAcrossSuppliers(drivers, hubRequest, { correlationId })

  return { runResult, hubResult }
}

/**
 * PHASE 28 — observabilité par fournisseur (jamais de credentials : seuls
 * des identifiants/statuts/durées/codes d'erreur, jamais un login/token).
 */
export function logHubSearchObservability(
  hubResult: HubSearchResult,
  ctx: { agencyId?: string | null; tenantId?: string | null; supplierAccountId?: string | null },
): void {
  for (const supplier of Object.keys(hubResult.supplierDetails) as SupplierName[]) {
    const detail = hubResult.supplierDetails[supplier]
    logger.info("[hotel-suppliers.search]", {
      correlationId: hubResult.correlationId,
      tenantId: ctx.tenantId ?? null,
      agencyId: ctx.agencyId ?? null,
      supplierId: supplier,
      supplierAccountId: supplier === "mygo" ? (ctx.supplierAccountId ?? null) : null,
      operation: "SEARCH",
      status: detail.status,
      elapsedMs: detail.elapsedMs,
      errorCode: detail.errorCode ?? null,
    })
  }
}

/**
 * Point d'entrée route handler complet : résout l'accès tenant (déjà fait
 * par l'appelant, voir routes), orchestre via le Hub pour l'observabilité,
 * puis renvoie la réponse HTTP EXACTEMENT comme `executeHotelSearch()`
 * (même formatage, même contrat, aucune régression) — voir le commentaire
 * de tête de fichier pour pourquoi la réponse ne provient pas de
 * `hubResult`.
 */
export async function executeHotelSearchThroughHub(
  q: HotelSearchQuery,
  access: ResolvedMyGoAccess | undefined,
  ctx: { agencyId?: string | null; tenantId?: string | null } = {},
): Promise<NextResponse> {
  const { runResult, hubResult } = await runSearchThroughHub(q, access)
  logHubSearchObservability(hubResult, { ...ctx, supplierAccountId: access?.accountId ?? null })
  return formatHotelSearchResponse(runResult)
}
