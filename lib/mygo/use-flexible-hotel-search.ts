"use client"

/**
 * PHASE 35 — hook client `useFlexibleHotelSearch` : encapsule l'appel à
 * `/api/hotels/search-flexible` (Phase 34), UNIQUEMENT quand `flexDays > 0`
 * — même idiome que `useHotelSearch` (lib/mygo/use-hotel-search.ts) :
 * `queryString` dérivé des searchParams, aucun `setState` synchrone dans le
 * corps de l'effet (statut dérivé au rendu en comparant `state.queryString`
 * à la clé courante).
 *
 * `flexDays === 0` (mode "Exactes") : `queryString` vaut `null`, l'effet ne
 * fait STRICTEMENT rien — zéro appel réseau supplémentaire, la recherche
 * classique (`useHotelSearch`) reste l'unique source de vérité, exactement
 * comme avant cette phase.
 */

import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import type { FlexibleSearchResult } from "@/lib/hotel-suppliers/flexible-search"

/**
 * Pure — extraite pour rester testable sans rendu React (voir
 * __tests__/use-flexible-hotel-search.test.ts). `null` dès que
 * `flexDays <= 0` (mode "Exactes") ou qu'un paramètre de recherche requis
 * manque : c'est CE `null` qui garantit qu'aucun appel réseau flexible
 * n'est jamais déclenché en mode classique (l'effet du hook fait un
 * early-return dessus).
 */
export function buildFlexibleSearchQueryString(params: {
  flexDays: number
  cityId: string | null
  checkin: string | null
  checkout: string | null
  adults: string
  children: string | null
}): string | null {
  if (params.flexDays <= 0 || !params.cityId || !params.checkin || !params.checkout) {
    return null
  }
  const qs = new URLSearchParams({
    cityId: params.cityId,
    checkin: params.checkin,
    checkout: params.checkout,
    adults: params.adults,
    flexDays: String(params.flexDays),
  })
  if (params.children) qs.set("children", params.children)
  return qs.toString()
}

/**
 * Pure — construit les query params de `/hotels/search` pour un changement
 * de fenêtre flexible (Exactes/±1/±2/±3), à partir des params courants.
 * N'altère jamais `checkin`/`checkout` : changer la fenêtre ne modifie
 * jamais la date déjà affichée en mode classique.
 */
export function applyFlexDaysToParams(
  current: URLSearchParams,
  flexDays: number,
): URLSearchParams {
  const next = new URLSearchParams(current)
  if (flexDays <= 0) next.delete("flexDays")
  else next.set("flexDays", String(flexDays))
  return next
}

/**
 * Pure — construit les query params après sélection d'une date candidate
 * flexible : remplace checkin/checkout par la date RÉELLEMENT choisie et
 * repasse en mode "Exactes" (retire flexDays) — c'est ce qui garantit que
 * la recherche classique se relance pour cette date précise plutôt que de
 * réserver depuis le résumé de comparaison (voir doc de tête de fichier).
 */
export function applyFlexibleCandidateToParams(
  current: URLSearchParams,
  candidateCheckin: string,
  candidateCheckout: string,
): URLSearchParams {
  const next = new URLSearchParams(current)
  next.set("checkin", candidateCheckin)
  next.set("checkout", candidateCheckout)
  next.delete("flexDays")
  return next
}

interface InternalState {
  queryString: string | null
  status: "idle" | "success" | "error"
  data: FlexibleSearchResult | null
  error: string | null
}

export interface FlexibleHotelSearchHookState {
  /** `"idle"` quand flexDays===0 (mode exact, pas de recherche flexible en cours). */
  status: "idle" | "loading" | "success" | "error"
  data: FlexibleSearchResult | null
  error: string | null
}

export function useFlexibleHotelSearch(flexDays: number): FlexibleHotelSearchHookState {
  const searchParams = useSearchParams()
  const [state, setState] = useState<InternalState>({
    queryString: null,
    status: "idle",
    data: null,
    error: null,
  })

  const cityId = searchParams.get("cityId")
  const checkin = searchParams.get("checkin")
  const checkout = searchParams.get("checkout")
  const adults = searchParams.get("adults") ?? "2"
  const children = searchParams.get("children")

  const queryString = useMemo(
    () => buildFlexibleSearchQueryString({ flexDays, cityId, checkin, checkout, adults, children }),
    [flexDays, cityId, checkin, checkout, adults, children],
  )

  useEffect(() => {
    if (!queryString) return
    const ctrl = new AbortController()
    fetch(`/api/hotels/search-flexible?${queryString}`, { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) {
          const body = (await r.json().catch(() => ({}))) as { message?: string; error?: string }
          throw new Error(body.message ?? body.error ?? `HTTP ${r.status}`)
        }
        return r.json() as Promise<FlexibleSearchResult>
      })
      .then((data) => setState({ queryString, status: "success", data, error: null }))
      .catch((err: unknown) => {
        if ((err as { name?: string }).name === "AbortError") return
        setState({
          queryString,
          status: "error",
          data: null,
          error: err instanceof Error ? err.message : "Erreur inconnue",
        })
      })
    return () => ctrl.abort()
  }, [queryString])

  // Statut dérivé au rendu — jamais de setState synchrone dans l'effet
  // (même contrainte que useHotelSearch).
  if (!queryString) {
    return { status: "idle", data: null, error: null }
  }
  if (state.queryString !== queryString) {
    return { status: "loading", data: null, error: null }
  }
  return { status: state.status === "idle" ? "loading" : state.status, data: state.data, error: state.error }
}
