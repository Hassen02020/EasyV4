"use client"

/**
 * Découpe un tableau déjà filtré/trié en pages — chantier 6 (Phase Premium
 * 2, pagination SERP), utilisé par les 3 moteurs de recherche (Hôtels
 * Tunisie, Hôtels Monde, Vols). Aucun changement côté fournisseur/API :
 * uniquement un slice côté client après filtre+tri.
 *
 * État piloté par `?page=N` dans l'URL (survit à un refresh/partage de lien,
 * comme les autres paramètres de recherche). Remise automatique à la page 1
 * quand :
 *  - un paramètre d'URL autre que `page` change (recherche/filtres/tri déjà
 *    reflétés dans l'URL, ex. Hôtels Tunisie) ;
 *  - `extraResetKey` change (filtres/tri qui ne vivent qu'en state local,
 *    ex. Hôtels Monde/Vols — voir leurs appels de ce hook).
 */

import { useEffect, useMemo, useRef } from "react"
import { useSearchParams } from "next/navigation"
import { useRouter, usePathname } from "@/i18n/navigation"

const DEFAULT_PAGE_SIZE = 10

export interface PaginatedResult<T> {
  pageItems: T[]
  currentPage: number
  totalPages: number
  setPage: (page: number) => void
}

export function usePaginatedResults<T>(
  items: T[],
  extraResetKey = "",
  pageSize: number = DEFAULT_PAGE_SIZE,
): PaginatedResult<T> {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const urlResetKey = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete("page")
    return params.toString()
  }, [searchParams])
  const resetKey = `${urlResetKey}|${extraResetKey}`

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const rawPage = Number.parseInt(searchParams.get("page") ?? "1", 10)
  const currentPage =
    Number.isFinite(rawPage) && rawPage >= 1 ? Math.min(rawPage, totalPages) : 1

  const setPage = (page: number) => {
    const params = new URLSearchParams(searchParams.toString())
    if (page <= 1) params.delete("page")
    else params.set("page", String(page))
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  const prevResetKey = useRef(resetKey)
  useEffect(() => {
    if (prevResetKey.current !== resetKey) {
      prevResetKey.current = resetKey
      if (searchParams.get("page")) setPage(1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey])

  const pageItems = items.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  return { pageItems, currentPage, totalPages, setPage }
}
