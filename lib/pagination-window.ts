/**
 * Fenêtre de numéros de page à afficher autour de la page courante, avec
 * ellipses aux bords — partagé par `components/search-pagination.tsx`
 * (pagination client des 3 moteurs de recherche) et
 * `components/catalog-pagination.tsx` (pagination serveur Packages/
 * Attractions/Omra), chantier 6 (Phase Premium 2).
 */
export type PageWindowEntry = number | "ellipsis"

export function buildPageWindow(currentPage: number, totalPages: number): PageWindowEntry[] {
  if (totalPages <= 1) return [1]

  const pages: PageWindowEntry[] = [1]
  const windowStart = Math.max(2, currentPage - 1)
  const windowEnd = Math.min(totalPages - 1, currentPage + 1)

  if (windowStart > 2) pages.push("ellipsis")
  for (let p = windowStart; p <= windowEnd; p++) pages.push(p)
  if (windowEnd < totalPages - 1) pages.push("ellipsis")
  pages.push(totalPages)

  return pages
}
