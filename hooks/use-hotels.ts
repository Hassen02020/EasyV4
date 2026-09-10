"use client"

import { useQuery } from "@tanstack/react-query"
import type { HotelSummaryDTO } from "@/lib/mygo/types"

/**
 * Recherche par hôtel (`/api/hotels/list`) — même modèle que `useCities`
 * (`hooks/use-cities.ts`) : `cityId` optionnel restreint la liste (résultats
 * plus pertinents pour un autocomplete "hôtel dans cette ville"), absent =
 * catalogue complet. `enabled` évite un fetch tant que l'utilisateur n'a
 * pas activé le mode "recherche par hôtel".
 */
async function fetchHotels(cityId?: number): Promise<HotelSummaryDTO[]> {
  const url = cityId ? `/api/hotels/list?cityId=${cityId}` : "/api/hotels/list"
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = (await res.json()) as { hotels: HotelSummaryDTO[] }
  return Array.isArray(data?.hotels) ? data.hotels : []
}

export function useHotels(cityId?: number, enabled = true) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["hotels", cityId ?? "all"],
    queryFn: () => fetchHotels(cityId),
    staleTime: 1000 * 60 * 60 * 24, // 24h — même politique que useCities
    enabled,
  })

  return {
    hotels: data ?? [],
    loading: isLoading,
    error: error
      ? error instanceof Error
        ? error.message
        : "Impossible de charger les hôtels"
      : null,
  }
}
