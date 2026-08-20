"use client"

/**
 * Hook client `useHotelSearch` — encapsule la requête
 * `/api/hotels/search-public` (recherche B2C publique, aucune session
 * requise — voir EASYV4_B2C_PUBLIC_SEARCH_REPORT.md). Utilisé uniquement
 * par la page de résultats publique (`app/hotels/search/page.tsx`) ; le
 * portail B2B `/pro` n'utilise pas ce hook.
 *
 * Lecture des paramètres depuis `useSearchParams` (cityId, checkin, checkout,
 * adults, children, stars, onlyAvailable). Renvoie `{ status, data, error }`
 * avec abort propre au démontage / changement de query.
 *
 * Pour respecter la règle `react-hooks/set-state-in-effect` (React 19), l'effet
 * ne fait PAS de `setState({ status: "loading" })` synchrone : on stocke à la
 * place le `queryString` qui a produit la donnée et on dérive le statut au
 * rendu (si `state.queryString !== queryString` courant ⇒ loading stale).
 */

import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import type { HotelSearchResultDTO } from "@/lib/mygo/types"

interface InternalState {
  queryString: string | null
  status: "idle" | "success" | "error"
  data: HotelSearchResultDTO | null
  error: string | null
  errorCode: string | null
  degraded: boolean
  fromStaleCache: boolean
}

export interface HotelSearchHookState {
  status: "loading" | "success" | "error"
  data: HotelSearchResultDTO | null
  error: string | null
  /** Code d'erreur machine renvoyé par l'API (`service_unavailable`,
   * `rate_limited`, `auth_failed`, `internal`…) — pilote le message/CTA
   * affiché plutôt qu'un texte générique unique pour toute erreur. */
  errorCode: string | null
  /** Résultat servi en mode dégradé (cache figé / panne fournisseur) —
   * `X-Degraded-Mode` côté API. */
  degraded: boolean
  /** Résultat servi depuis un cache déjà périmé (`X-From-Cache`). */
  fromStaleCache: boolean
  queryString: string | null
  /** Relance la même recherche (ex. bouton "Réessayer" après un 503/réseau). */
  retry: () => void
}

export function useHotelSearch(): HotelSearchHookState {
  const searchParams = useSearchParams()
  const [state, setState] = useState<InternalState>({
    queryString: null,
    status: "idle",
    data: null,
    error: null,
    errorCode: null,
    degraded: false,
    fromStaleCache: false,
  })
  // Compteur incrémenté par `retry()` — inclus dans les deps de l'effet
  // pour forcer une relance sans changer la query envoyée à l'API.
  const [retryTick, setRetryTick] = useState(0)

  const cityId = searchParams.get("cityId")
  const checkin = searchParams.get("checkin")
  const checkout = searchParams.get("checkout")
  const adults = searchParams.get("adults") ?? "2"
  const children = searchParams.get("children")
  const stars = searchParams.get("stars")
  const onlyAvailable = searchParams.get("onlyAvailable")
  // Multi-room (encodage compact, voir app/api/hotels/search/route.ts) —
  // absent = repli sur adults/children (une seule chambre).
  const rooms = searchParams.get("rooms")

  const queryString = useMemo(() => {
    if (!cityId || !checkin || !checkout) return null
    const params = new URLSearchParams({ cityId, checkin, checkout, adults })
    if (children) params.set("children", children)
    if (stars) params.set("stars", stars)
    if (onlyAvailable) params.set("onlyAvailable", onlyAvailable)
    if (rooms) params.set("rooms", rooms)
    return params.toString()
  }, [cityId, checkin, checkout, adults, children, stars, onlyAvailable, rooms])

  useEffect(() => {
    if (!queryString) return
    const ctrl = new AbortController()
    fetch(`/api/hotels/search-public?${queryString}`, { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) {
          const body = (await r.json().catch(() => ({}))) as {
            message?: string
            error?: string
          }
          const err = new Error(
            body.message ?? body.error ?? `HTTP ${r.status}`,
          ) as Error & { code?: string }
          err.code = body.error
          throw err
        }
        const data = (await r.json()) as HotelSearchResultDTO
        return {
          data,
          degraded: r.headers.get("X-Degraded-Mode") === "1",
          fromStaleCache: r.headers.get("X-From-Cache") === "1",
        }
      })
      .then(({ data, degraded, fromStaleCache }) =>
        setState({
          queryString,
          status: "success",
          data,
          error: null,
          errorCode: null,
          degraded,
          fromStaleCache,
        }),
      )
      .catch((err: unknown) => {
        if ((err as { name?: string }).name === "AbortError") return
        setState({
          queryString,
          status: "error",
          data: null,
          error: err instanceof Error ? err.message : "Erreur inconnue",
          errorCode: (err as { code?: string })?.code ?? null,
          degraded: false,
          fromStaleCache: false,
        })
      })
    return () => ctrl.abort()
  }, [queryString, retryTick])

  // Derived at render time (no setState in effect):
  let effectiveStatus: "loading" | "success" | "error"
  let effectiveError: string | null = state.error
  let effectiveErrorCode: string | null = state.errorCode
  let effectiveData: HotelSearchResultDTO | null = state.data
  if (!queryString) {
    effectiveStatus = "error"
    effectiveError = "Critères de recherche incomplets — retournez à l'accueil."
    effectiveErrorCode = "incomplete_query"
    effectiveData = null
  } else if (state.queryString !== queryString) {
    // queryString a changé, l'effet va déclencher un nouveau fetch -> loading
    effectiveStatus = "loading"
    effectiveError = null
    effectiveErrorCode = null
    effectiveData = null
  } else {
    effectiveStatus = state.status === "idle" ? "loading" : state.status
  }

  return {
    status: effectiveStatus,
    data: effectiveData,
    error: effectiveError,
    errorCode: effectiveErrorCode,
    degraded: state.queryString === queryString ? state.degraded : false,
    fromStaleCache: state.queryString === queryString ? state.fromStaleCache : false,
    queryString,
    retry: () => setRetryTick((n) => n + 1),
  }
}
