"use client"

import { useQuery } from "@tanstack/react-query"

export interface City {
  id: number
  name: string
  region?: string
}

async function fetchCities(): Promise<City[]> {
  const res = await fetch("/api/hotels/cities")
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = (await res.json()) as { cities: City[] }
  return Array.isArray(data?.cities) ? data.cities : []
}

const FALLBACK: City[] = [
  { id: 10, name: "Hammamet", region: "Cap Bon" },
  { id: 11, name: "Nabeul", region: "Cap Bon" },
  { id: 17, name: "Kairouan", region: "Centre" },
]

export function useCities() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["cities"],
    queryFn: fetchCities,
    staleTime: 1000 * 60 * 60 * 24, // 24h — les villes ne changent jamais
    placeholderData: FALLBACK,
  })

  return {
    cities: data ?? FALLBACK,
    loading: isLoading,
    error: error
      ? error instanceof Error
        ? error.message
        : "Impossible de charger les villes"
      : null,
  }
}
