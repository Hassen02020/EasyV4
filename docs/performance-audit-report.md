# Audit Report - Performance & Caching
**Date** : 13 Juin 2026
**Projet** : Easy2Book V6

## 1. Utilisation de React Query - PARTIELLE

### État Actuel
React Query est installé et configuré mais très peu utilisé :
- `lib/query-client.ts` - Configuration globale (staleTime: 5 min)
- `hooks/use-cities.ts` - 1 seul hook avec useQuery
- `components/query-provider.tsx` - Provider configuré

### Problème
React Query n'est pas utilisé pour la majorité des données :
- Liste des réservations
- Liste des produits
- Données dashboard
- Données wallet
- Données agences

### Impact
- Requêtes répétitives inutiles
- Pas de cache côté client
- Latence accrue
- Charge serveur inutile

### Recommandation
Créer des hooks React Query pour toutes les données fréquemment consultées :

**Structure proposée :**
```
hooks/
├── use-cities.ts (existe déjà)
├── use-agencies.ts (nouveau)
├── use-reservations.ts (nouveau)
├── use-wallet.ts (nouveau)
├── use-products.ts (nouveau)
├── use-suppliers.ts (nouveau)
└── use-dashboard.ts (nouveau)
```

**Exemple d'implémentation :**
```typescript
// hooks/use-wallet.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { walletService } from "@/lib/services/wallet/wallet-service"

export function useWalletBalance(agencyId: string) {
  return useQuery({
    queryKey: ["wallet", "balance", agencyId],
    queryFn: () => walletService.getWalletBalance(agencyId),
    staleTime: 1000 * 60 * 1, // 1 min
    refetchInterval: 1000 * 30, // Recharger toutes les 30 sec
  })
}

export function useWalletTransactions(agencyId: string, limit = 20) {
  return useQuery({
    queryKey: ["wallet", "transactions", agencyId, limit],
    queryFn: () => walletService.getWalletTransactions(agencyId, limit),
    staleTime: 1000 * 60 * 2, // 2 min
  })
}

export function useDebitWallet() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: walletService.debit,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wallet"] })
    },
  })
}
```

## 2. Pas de Debounce sur les Inputs de Recherche

### Problème
Les inputs de recherche n'ont pas de debounce :
- Recherche hôtelière
- Recherche vols
- Recherche clients

### Impact
- Requêtes API inutiles à chaque frappe
- Surcharge des API fournisseurs
- Latence utilisateur

### Recommandation
Implémenter le debounce sur tous les inputs de recherche :
```typescript
// hooks/use-debounce.ts
import { useState, useEffect } from "react"

export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}

// Utilisation
// components/hotel-search/search-input.tsx
const [searchTerm, setSearchTerm] = useState("")
const debouncedSearchTerm = useDebounce(searchTerm, 500)

const { data } = useQuery({
  queryKey: ["hotels", "search", debouncedSearchTerm],
  queryFn: () => searchHotels(debouncedSearchTerm),
  enabled: debouncedSearchTerm.length >= 3,
})
```

## 3. Pas de Cache Côté Serveur

### Problème
Aucun cache côté serveur n'est utilisé :
- Pas de Redis
- Pas de cache Next.js
- Requêtes répétitives à la base de données

### Impact
- Charge sur la base de données
- Latence accrue
- Coût infrastructure

### Recommandation
Implémenter un cache côté serveur :

**Option A : Redis (Recommandée pour production)**
```typescript
// lib/cache/redis.ts (existe déjà)
import { Redis } from "@upstash/redis"

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

export async function getCache<T>(key: string): Promise<T | null> {
  const data = await redis.get(key)
  return data as T | null
}

export async function setCache<T>(key: string, value: T, ttl: number = 3600) {
  await redis.set(key, JSON.stringify(value), { ex: ttl })
}

// Utilisation
// lib/services/agencies/agency-repository.ts
async findAll() {
  const cacheKey = "agencies:all"
  const cached = await getCache(cacheKey)
  if (cached) return cached

  const data = await this.db.query.agencies.findMany()
  await setCache(cacheKey, data, 3600) // 1 heure
  return data
}
```

**Option B : Next.js Cache (Plus simple)**
```typescript
// lib/services/agencies/agency-repository.ts
import { unstable_cache } from "next/cache"

async findAll() {
  return unstable_cache(
    async () => {
      return this.db.query.agencies.findMany()
    },
    ["agencies:all"],
    { revalidate: 3600 } // 1 heure
  )()
}
```

## 4. Pas de Pagination Optimisée

### Problème
La pagination utilise le pattern cursor mais sans optimisation :
- Chargement de toutes les données
- Pas de preloading
- Pas de infinite scroll optimisé

### Impact
- Latence utilisateur
- Charge serveur
- Mauvaise UX

### Recommandation
Optimiser la pagination avec React Query :
```typescript
// hooks/use-infinite-reservations.ts
import { useInfiniteQuery } from "@tanstack/react-query"
import { reservationService } from "@/lib/services/reservations/reservation-service"

export function useInfiniteReservations(agencyId: string) {
  return useInfiniteQuery({
    queryKey: ["reservations", "infinite", agencyId],
    queryFn: ({ pageParam = 0 }) =>
      reservationService.getReservations(agencyId, {
        page: pageParam,
        limit: 20,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      if (lastPage.length < 20) return undefined
      return lastPage[lastPage.length - 1].id
    },
  })
}
```

## 5. Pas de Optimistic Updates

### Problème
Les mutations n'ont pas d'optimistic updates :
- Mise à jour wallet
- Création réservation
- Validation recharge

### Impact
- UX dégradée
- Latence ressentie
- Chargement inutile

### Recommandation
Implémenter les optimistic updates avec React Query :
```typescript
// hooks/use-debit-wallet.ts
export function useDebitWallet() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: walletService.debit,
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ["wallet", "balance"] })

      const previousBalance = queryClient.getQueryData(["wallet", "balance"])

      queryClient.setQueryData(["wallet", "balance"], (old: number) => {
        return old - variables.amount
      })

      return { previousBalance }
    },
    onError: (err, variables, context) => {
      queryClient.setQueryData(["wallet", "balance"], context?.previousBalance)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["wallet"] })
    },
  })
}
```

## Plan de Migration Prioritaire

### Étape 1 : Hooks React Query (1 semaine)
1. Créer `hooks/use-wallet.ts`
2. Créer `hooks/use-reservations.ts`
3. Créer `hooks/use-agencies.ts`
4. Créer `hooks/use-products.ts`
5. Créer `hooks/use-dashboard.ts`

### Étape 2 : Debounce (1 jour)
1. Créer `hooks/use-debounce.ts`
2. Ajouter debounce sur tous les inputs de recherche
3. Tests

### Étape 3 : Cache Serveur (2 jours)
1. Configurer Redis ou Next.js cache
2. Ajouter cache aux données statiques (agences, produits)
3. Configurer les temps de revalidation

### Étape 4 : Pagination Optimisée (2 jours)
1. Implémenter useInfiniteQuery
2. Ajouter preloading
3. Tests

### Étape 5 : Optimistic Updates (2 jours)
1. Implémenter optimistic updates pour wallet
2. Implémenter optimistic updates pour réservations
3. Tests

## Conclusion

La performance souffre de :
1. React Query très peu utilisé (1 seul hook)
2. Pas de debounce sur les inputs de recherche
3. Pas de cache côté serveur
4. Pagination non optimisée
5. Pas d'optimistic updates

Une migration progressive vers React Query et l'ajout de cache est recommandée pour améliorer significativement la performance et l'UX.
