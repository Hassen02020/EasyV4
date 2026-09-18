"use client"

/**
 * Pagination client des 3 moteurs de recherche (Hôtels Tunisie, Hôtels
 * Monde, Vols) — chantier 6 (Phase Premium 2). Découpage déjà fait par
 * `hooks/use-paginated-results.ts` ; ce composant n'est que la vue,
 * construite sur les primitives `components/ui/pagination.tsx`.
 */

import { useTranslations } from "next-intl"
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

interface SearchPaginationProps {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
}

export function SearchPagination({ currentPage, totalPages, onPageChange }: SearchPaginationProps) {
  const t = useTranslations("Common")
  if (totalPages <= 1) return null
  const pages = buildPageWindow(currentPage, totalPages)

  return (
    <Pagination className="mt-6">
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            href="#"
            label={t("paginationPrevious")}
            ariaLabel={t("paginationPreviousAria")}
            aria-disabled={currentPage === 1}
            className={currentPage === 1 ? "pointer-events-none opacity-50" : undefined}
            onClick={(e) => {
              e.preventDefault()
              if (currentPage > 1) onPageChange(currentPage - 1)
            }}
          />
        </PaginationItem>
        {pages.map((p, i) =>
          p === "ellipsis" ? (
            <PaginationItem key={`ellipsis-${i}`}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={p}>
              <PaginationLink
                href="#"
                isActive={p === currentPage}
                aria-label={t("paginationGoToPage", { page: p })}
                onClick={(e) => {
                  e.preventDefault()
                  onPageChange(p)
                }}
              >
                {p}
              </PaginationLink>
            </PaginationItem>
          ),
        )}
        <PaginationItem>
          <PaginationNext
            href="#"
            label={t("paginationNext")}
            ariaLabel={t("paginationNextAria")}
            aria-disabled={currentPage === totalPages}
            className={currentPage === totalPages ? "pointer-events-none opacity-50" : undefined}
            onClick={(e) => {
              e.preventDefault()
              if (currentPage < totalPages) onPageChange(currentPage + 1)
            }}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  )
}
