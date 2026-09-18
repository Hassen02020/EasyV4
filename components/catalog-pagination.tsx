/**
 * Pagination serveur (vraie navigation, pas de state client) pour les
 * catalogues Packages/Attractions/Omra — chantier 6 (Phase Premium 2).
 * Chaque page vient d'un vrai `.limit()/.offset()` Drizzle
 * (`lib/admin/pagination.ts::paginateOffset()`) ; ce composant ne fait que
 * construire les liens `?page=N` (locale déjà incluse dans `buildHref`).
 * Server Component — aucun `"use client"` nécessaire, `<a>` suffit puisque
 * les pages cibles sont de toute façon `dynamic = "force-dynamic"`.
 */

import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { buildPageWindow } from "@/lib/pagination-window"

interface CatalogPaginationLabels {
  previous: string
  next: string
  previousAria: string
  nextAria: string
  goToPage: (page: number) => string
}

interface CatalogPaginationProps {
  currentPage: number
  totalPages: number
  buildHref: (page: number) => string
  labels: CatalogPaginationLabels
}

export function CatalogPagination({ currentPage, totalPages, buildHref, labels }: CatalogPaginationProps) {
  if (totalPages <= 1) return null
  const pages = buildPageWindow(currentPage, totalPages)

  return (
    <Pagination className="mt-8">
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            href={currentPage > 1 ? buildHref(currentPage - 1) : undefined}
            label={labels.previous}
            ariaLabel={labels.previousAria}
            aria-disabled={currentPage === 1}
            className={currentPage === 1 ? "pointer-events-none opacity-50" : undefined}
          />
        </PaginationItem>
        {pages.map((p, i) =>
          p === "ellipsis" ? (
            <PaginationItem key={`ellipsis-${i}`}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={p}>
              <PaginationLink href={buildHref(p)} isActive={p === currentPage} aria-label={labels.goToPage(p)}>
                {p}
              </PaginationLink>
            </PaginationItem>
          ),
        )}
        <PaginationItem>
          <PaginationNext
            href={currentPage < totalPages ? buildHref(currentPage + 1) : undefined}
            label={labels.next}
            ariaLabel={labels.nextAria}
            aria-disabled={currentPage === totalPages}
            className={currentPage === totalPages ? "pointer-events-none opacity-50" : undefined}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  )
}
