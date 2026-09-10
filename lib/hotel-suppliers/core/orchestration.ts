/**
 * Moteur d'orchestration du Hub — exécute tous les drivers fournisseurs en
 * parallèle, isole les échecs/timeouts individuels (jamais un fournisseur
 * lent ne bloque les autres), agrège et déduplique les résultats.
 *
 * N'appelle JAMAIS Booking Core ni le moteur de paiement — c'est une
 * lecture pure (recherche). La réservation reste un appel driver-par-
 * driver explicite, orchestré par l'appelant (voir section 13 de la
 * mission — booking non implémenté ici, seulement le contrat).
 */

import type {
  HotelSearchRequest,
  HubSearchResult,
  SupplierName,
  SupplierRunStatus,
  SupplierRunDetail,
  NormalizedHotel,
  NormalizedRate,
} from "./types"
import type { HotelSupplierDriver } from "./supplier"
import { deduplicateHotels } from "./deduplication"

const DEFAULT_TIMEOUT_MS = 8_000

export interface OrchestrationOptions {
  timeoutMs?: number
  correlationId?: string
}

interface DriverRunOutcome {
  supplier: SupplierName
  status: SupplierRunStatus
  elapsedMs: number
  errorCode?: string
  errorMessage?: string
  hotels: NormalizedHotel[]
  rates: NormalizedRate[]
}

type RaceResult<T> =
  | { kind: "ok"; value: T }
  | { kind: "err"; error: unknown }
  | { kind: "timeout" }

async function runDriver(
  driver: HotelSupplierDriver,
  request: HotelSearchRequest,
  timeoutMs: number,
): Promise<DriverRunOutcome> {
  if (driver.getConfigStatus() === "NOT_CONFIGURED") {
    return { supplier: driver.supplier, status: "NOT_CONFIGURED", elapsedMs: 0, hotels: [], rates: [] }
  }

  const start = Date.now()
  const raced = await Promise.race<RaceResult<{ hotels: NormalizedHotel[]; rates: NormalizedRate[] }>>([
    driver
      .search(request)
      .then((v) => ({ kind: "ok" as const, value: v }))
      .catch((error: unknown) => ({ kind: "err" as const, error })),
    new Promise((resolve) => setTimeout(() => resolve({ kind: "timeout" }), timeoutMs)),
  ])
  const elapsedMs = Date.now() - start

  if (raced.kind === "timeout") {
    return {
      supplier: driver.supplier,
      status: "TIMEOUT",
      elapsedMs: timeoutMs,
      errorCode: "TIMEOUT",
      errorMessage: `Aucune réponse de "${driver.supplier}" après ${timeoutMs}ms.`,
      hotels: [],
      rates: [],
    }
  }

  if (raced.kind === "err") {
    const err = raced.error
    const code = (err as { code?: string } | null)?.code ?? "SUPPLIER_ERROR"
    const message = err instanceof Error ? err.message : String(err)
    return { supplier: driver.supplier, status: "ERROR", elapsedMs, errorCode: code, errorMessage: message, hotels: [], rates: [] }
  }

  return { supplier: driver.supplier, status: "SUCCESS", elapsedMs, hotels: raced.value.hotels, rates: raced.value.rates }
}

export async function searchAcrossSuppliers(
  drivers: HotelSupplierDriver[],
  request: HotelSearchRequest,
  options: OrchestrationOptions = {},
): Promise<HubSearchResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const correlationId = options.correlationId ?? crypto.randomUUID()
  const start = Date.now()

  const outcomes = await Promise.allSettled(drivers.map((d) => runDriver(d, request, timeoutMs)))

  const supplierStatus: Record<string, SupplierRunStatus> = {}
  const supplierDetails: Record<string, SupplierRunDetail> = {}
  const failedSuppliers: SupplierName[] = []
  const allHotels: NormalizedHotel[] = []
  const allRates: NormalizedRate[] = []

  for (const outcome of outcomes) {
    if (outcome.status !== "fulfilled") continue // runDriver catch tout en interne — filet de sécurité seulement
    const r = outcome.value
    supplierStatus[r.supplier] = r.status
    supplierDetails[r.supplier] = {
      status: r.status,
      elapsedMs: r.elapsedMs,
      errorCode: r.errorCode,
      errorMessage: r.errorMessage,
    }
    if (r.status !== "SUCCESS") failedSuppliers.push(r.supplier)
    allHotels.push(...r.hotels)
    allRates.push(...r.rates)
  }

  const groups = deduplicateHotels(allHotels, allRates)

  return {
    correlationId,
    results: groups.map((g) => g.hotel),
    rates: allRates,
    supplierStatus: supplierStatus as Record<SupplierName, SupplierRunStatus>,
    elapsedMs: Date.now() - start,
    failedSuppliers,
    supplierDetails: supplierDetails as Record<SupplierName, SupplierRunDetail>,
  }
}
