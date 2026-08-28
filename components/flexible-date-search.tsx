"use client"

/**
 * PHASE 35 — UX minimale pour la recherche à dates flexibles (Phase 34,
 * `/api/hotels/search-flexible`). Réutilise les conventions déjà en place
 * (Button, Skeleton, date-fns+fr, useCurrency) — aucun nouveau design
 * system, aucun nouveau moteur de recherche/tri/dédup côté client : ce
 * composant ne fait qu'appeler `useFlexibleHotelSearch` (qui appelle le
 * Universal Hub via `/api/hotels/search-flexible`) et afficher le résultat
 * TEL QUEL — jamais un prix recalculé ou une disponibilité devinée ici.
 *
 * Sécurité de réservation (section 19 du master prompt Phase 35) :
 * cliquer une date candidate n'ouvre JAMAIS directement une réservation —
 * `onSelectCandidate` ne fait que changer `checkin`/`checkout` dans l'URL,
 * ce qui redéclenche la recherche CLASSIQUE (`useHotelSearch`) pour ces
 * dates précises. Les résultats affichés dans la liste d'hôtels
 * proviennent donc toujours d'une recherche réelle et fraîche pour la date
 * effectivement choisie — jamais un token/offre reconstruit depuis un
 * résumé de comparaison.
 */

import { useMemo } from "react"
import { format, parseISO } from "date-fns"
import { fr } from "date-fns/locale"
import { Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useCurrency } from "@/components/currency-context"
import { useFlexibleHotelSearch } from "@/lib/mygo/use-flexible-hotel-search"

const FLEX_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "Exactes" },
  { value: 1, label: "±1 jour" },
  { value: 2, label: "±2 jours" },
  { value: 3, label: "±3 jours" },
]

function formatShortRange(checkin: string, checkout: string): string {
  try {
    const from = parseISO(checkin)
    const to = parseISO(checkout)
    return `${format(from, "d MMM", { locale: fr })} → ${format(to, "d MMM", { locale: fr })}`
  } catch {
    return `${checkin} → ${checkout}`
  }
}

interface FlexibleDateSearchProps {
  flexDays: number
  onFlexDaysChange: (flexDays: number) => void
  requestedCheckin: string | null
  requestedCheckout: string | null
  /** Change checkin/checkout dans l'URL courante — ne réserve jamais directement. */
  onSelectCandidate: (checkin: string, checkout: string) => void
}

export function FlexibleDateSearch({
  flexDays,
  onFlexDaysChange,
  requestedCheckin,
  requestedCheckout,
  onSelectCandidate,
}: FlexibleDateSearchProps) {
  const { format: formatPrice } = useCurrency()
  const { status, data, error } = useFlexibleHotelSearch(flexDays)

  // Meilleur prix RÉEL parmi les candidats ayant effectivement des offres —
  // jamais un badge "meilleur prix" sur un candidat sans résultat confirmé.
  const bestPrice = useMemo(() => {
    if (!data) return null
    const priced = data.candidates.filter((c) => c.ok && c.fromPrice != null)
    if (priced.length === 0) return null
    return Math.min(...priced.map((c) => c.fromPrice!))
  }, [data])

  if (!requestedCheckin || !requestedCheckout) return null

  return (
    <div className="border-border bg-card mb-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-muted-foreground text-xs">Dates demandées</p>
          <p className="text-foreground text-sm font-medium">
            {formatShortRange(requestedCheckin, requestedCheckout)}
          </p>
        </div>
        <div
          role="group"
          aria-label="Dates flexibles"
          className="flex flex-wrap gap-1.5"
        >
          {FLEX_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              type="button"
              size="sm"
              variant={flexDays === opt.value ? "default" : "outline"}
              aria-pressed={flexDays === opt.value}
              onClick={() => onFlexDaysChange(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      {flexDays > 0 && (
        <div className="border-border mt-3 border-t pt-3">
          {status === "loading" && (
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-40" />
              ))}
            </div>
          )}

          {status === "error" && (
            <p className="text-destructive text-xs">
              Impossible de charger les dates flexibles : {error}. Les dates exactes restent disponibles ci-dessous.
            </p>
          )}

          {status === "success" && data && (
            <>
              <p className="text-muted-foreground mb-2 flex items-center gap-1.5 text-xs font-medium">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                Disponibilités autour de vos dates
              </p>
              <div className="flex flex-wrap gap-2">
                {data.candidates.map((c) => {
                  const isRequested = c.offsetDays === 0
                  const isBest =
                    bestPrice != null && c.ok && c.fromPrice === bestPrice && !isRequested
                  return (
                    <button
                      key={`${c.checkin}-${c.checkout}`}
                      type="button"
                      disabled={!c.ok || c.offersCount === 0}
                      onClick={() => onSelectCandidate(c.checkin, c.checkout)}
                      className={`flex flex-col items-start rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                        isRequested
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      } ${!c.ok || c.offersCount === 0 ? "cursor-not-allowed opacity-50" : ""}`}
                    >
                      <span className="text-foreground font-medium">
                        {formatShortRange(c.checkin, c.checkout)}
                        {isRequested && " (demandé)"}
                      </span>
                      {c.ok && c.fromPrice != null ? (
                        <span className="text-primary mt-0.5 font-semibold">
                          dès {formatPrice(c.fromPrice)}
                          {isBest && (
                            <span className="ml-1.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                              Meilleur prix
                            </span>
                          )}
                        </span>
                      ) : c.ok ? (
                        <span className="text-muted-foreground mt-0.5">Aucune offre</span>
                      ) : (
                        <span className="text-muted-foreground mt-0.5">Indisponible</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
