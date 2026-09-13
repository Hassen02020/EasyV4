"use client"

/**
 * Chantier 3 — même rôle que hooks/use-cities.ts (Hôtels Tunisie/myGo) pour
 * les 3 modules mappés au Canonical Destination Model : Hôtels Monde,
 * Packages, Vols. Renvoie toujours l'`external_id` déjà utilisé par le
 * module (slug/code IATA), jamais l'UUID interne — voir
 * app/api/destinations/search/route.ts.
 */

import { useQuery } from "@tanstack/react-query"

export type DestinationModule = "hotels_monde_slug" | "packages_slug" | "iata"

export interface DestinationOption {
  externalId: string
  name: string
  nameEn: string | null
  nameAr: string | null
  countryName: string | null
  countryNameEn: string | null
  countryNameAr: string | null
}

async function fetchDestinations(module: DestinationModule): Promise<DestinationOption[]> {
  const res = await fetch(`/api/destinations/search?module=${module}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = (await res.json()) as { destinations: DestinationOption[] }
  return Array.isArray(data?.destinations) ? data.destinations : []
}

export function useDestinations(module: DestinationModule) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["destinations", module],
    queryFn: () => fetchDestinations(module),
    staleTime: 1000 * 60 * 60 * 24, // 24h — les destinations ne changent quasiment jamais
  })

  return {
    destinations: data ?? [],
    loading: isLoading,
    error: error
      ? error instanceof Error
        ? error.message
        : "Impossible de charger les destinations"
      : null,
  }
}
