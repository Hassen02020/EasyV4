"use client"

/**
 * PHASE 30 — liste "Chambres et tarifs disponibles" partagée entre la card
 * de résultats (components/hotel-card.tsx, section repliable) et la fiche
 * hôtel (app/hotels/[id]/page.tsx, section "ROOMS & RATES" toujours
 * visible) : UNE SEULE implémentation de la logique d'affichage
 * annulation/disponibilité/sélection/réservation, pour ne jamais la
 * dupliquer (ni risquer qu'elle diverge, ex. le bug "annulation gratuite"
 * corrigé Phase 30 dans components/hotel-listings.tsx::toCardShape).
 */
import { useState } from "react"
import { Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCurrency } from "@/components/currency-context"

export interface RoomOption {
  id: number
  name: string
  /** Jamais réduit à une seule date : une chambre non remboursable ou sans politique BEFORE_ARRIVAL à 0 frais ne doit jamais afficher "gratuite". */
  cancellation: "FREE" | "NON_REFUNDABLE" | "UNKNOWN"
  /** Uniquement rempli quand `cancellation === "FREE"`. */
  freeCancellationDate?: string
  available: boolean
  price: number
  boardingId?: number
  boardingCode?: string
  /** Pension RÉELLE de cette chambre — fait foi pour la réservation, jamais un onglet/état externe. */
  boardingName: string
}

interface HotelRoomRatesProps {
  rooms: RoomOption[]
  onBook?: (mealPlan: string, room?: RoomOption) => void
  /** `false` masque le bandeau titre "Chambres et tarifs disponibles" (déjà présent ailleurs, ex. h2 de section sur la fiche hôtel). */
  showHeader?: boolean
}

export function HotelRoomRates({ rooms, onBook, showHeader = true }: HotelRoomRatesProps) {
  const { format } = useCurrency()
  const [selectedRoom, setSelectedRoom] = useState<number | null>(null)

  return (
    <div className="border-border bg-card overflow-hidden rounded-lg border">
      {showHeader && (
        <div className="bg-muted/30 border-border border-b px-4 py-3">
          <h4 className="text-foreground font-semibold">
            Chambres et tarifs disponibles
          </h4>
        </div>
      )}

      {rooms.length === 0 && (
        <div className="text-muted-foreground px-4 py-6 text-sm">
          Aucune chambre disponible pour cette offre.
        </div>
      )}

      <div className="divide-border divide-y">
        {rooms.map((room) => (
          <button
            key={room.id}
            type="button"
            onClick={() => setSelectedRoom(room.id)}
            className={`hover:bg-muted/30 flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors ${
              selectedRoom === room.id ? "bg-primary/5 border-l-primary border-l-4" : ""
            }`}
          >
            <div className="flex items-center gap-3">
              {selectedRoom === room.id && (
                <div className="bg-primary flex h-5 w-5 shrink-0 items-center justify-center rounded-full">
                  <Check className="text-primary-foreground h-3 w-3" />
                </div>
              )}
              <div>
                <p
                  className={`font-medium ${selectedRoom === room.id ? "text-primary" : "text-foreground"}`}
                >
                  {room.name}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {room.cancellation === "FREE" && (
                    <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                      {room.freeCancellationDate
                        ? `Annulation gratuite avant le ${room.freeCancellationDate}`
                        : "Annulation gratuite"}
                    </span>
                  )}
                  {room.cancellation === "NON_REFUNDABLE" && (
                    <span className="bg-muted text-muted-foreground rounded px-2 py-0.5 text-xs">
                      Non remboursable
                    </span>
                  )}
                  {room.cancellation === "UNKNOWN" && (
                    <span className="bg-muted text-muted-foreground rounded px-2 py-0.5 text-xs">
                      Conditions d&apos;annulation sur demande
                    </span>
                  )}
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${
                      room.available
                        ? "bg-muted text-muted-foreground"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {room.available ? "Disponible" : "Sur demande"}
                  </span>
                </div>
              </div>
            </div>
            <span className="text-primary shrink-0 text-lg font-bold">
              {format(room.price)}
            </span>
          </button>
        ))}
      </div>

      {rooms.length > 0 && (
        <div className="bg-muted/30 border-border flex justify-end border-t px-4 py-3">
          <Button
            onClick={() => {
              const selected = rooms.find((r) => r.id === selectedRoom)
              onBook?.(selected?.boardingName ?? "", selected)
            }}
            disabled={!selectedRoom}
            className="gap-2"
          >
            Réserver
          </Button>
        </div>
      )}
    </div>
  )
}
