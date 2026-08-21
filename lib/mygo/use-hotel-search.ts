"use client"

/**
 * Hook client `useHotelSearch` — encapsule la requête `/api/hotels/search`.
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
}

export interface HotelSearchHookState {
  status: "loading" | "success" | "error"
  data: HotelSearchResultDTO | null
  error: string | null
  queryString: string | null
}

export function useHotelSearch(): HotelSearchHookState {
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
  const stars = searchParams.get("stars")
  const onlyAvailable = searchParams.get("onlyAvailable")

  const queryString = useMemo(() => {
    if (!cityId || !checkin || !checkout) return null
    const params = new URLSearchParams({ cityId, checkin, checkout, adults })
    if (children) params.set("children", children)
    if (stars) params.set("stars", stars)
    if (onlyAvailable) params.set("onlyAvailable", onlyAvailable)
    return params.toString()
  }, [cityId, checkin, checkout, adults, children, stars, onlyAvailable])

  useEffect(() => {
    if (!queryString) return
    const ctrl = new AbortController()
    fetch(`/api/hotels/search?${queryString}`, { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) {
          const body = (await r.json().catch(() => ({}))) as {
            message?: string
            error?: string
          }
          throw new Error(body.message ?? body.error ?? `HTTP ${r.status}`)
        }
        return r.json() as Promise<HotelSearchResultDTO>
      })
      .then((data) =>
        setState({ queryString, status: "success", data, error: null }),
      )
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

  // Derived at render time (no setState in effect):
  let effectiveStatus: "loading" | "success" | "error"
  let effectiveError: string | null = state.error
  let effectiveData: HotelSearchResultDTO | null = state.data
  if (!queryString) {
    effectiveStatus = "error"
    effectiveError = "Critères de recherche incomplets — retournez à l'accueil."
    effectiveData = null
  } else if (state.queryString !== queryString) {
    // queryString a changé, l'effet va déclencher un nouveau fetch -> loading
    effectiveStatus = "loading"
    effectiveError = null
    effectiveData = null
  } else {
    effectiveStatus = state.status === "idle" ? "loading" : state.status
  }

  return {
    status: effectiveStatus,
    data: effectiveData,
    error: effectiveError,
    queryString,
  }
}
