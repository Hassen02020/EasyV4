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
import { Check, Utensils, ShieldCheck, ShieldOff, HelpCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCurrency } from "@/components/currency-context"

export interface RoomOption {
  id: number
  /**
   * PHASE 36 — identité UI unique, DISTINCTE de `id` : myGo réutilise le
   * même `room.id` pour le même type de chambre à travers PLUSIEURS
   * pensions (ex. "Chambre Familiale" existe avec le même id sous
   * "Logement Simple" ET "Logement Petit Déjeuner") — confirmé en
   * environnement réel (React "duplicate key" + une sélection qui
   * résolvait sur la MAUVAISE pension/le mauvais prix via
   * `rooms.find(r => r.id === selectedRoom)`). `key` (boardingId+id+groupe)
   * reste unique par ligne réellement affichée ; `id` continue de porter
   * le vrai roomId myGo, inchangé pour la réservation (BookingCreation).
   */
  key: string
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
  /**
   * PHASE 32 — notifie le parent de la chambre actuellement sélectionnée
   * (ou `null` si aucune) — permet par ex. au panneau d'achat sticky de la
   * fiche hôtel de refléter "Chambre sélectionnée : X — Y TND" au lieu du
   * seul prix générique. Composant non-contrôlé : `selectedRoom` reste la
   * source de vérité interne, ce callback n'est qu'une notification.
   * Optionnel — la card SERP (repliable) ne le fournit pas.
   */
  onSelectionChange?: (room: RoomOption | null) => void
}

export function HotelRoomRates({
  rooms,
  onBook,
  showHeader = true,
  onSelectionChange,
}: HotelRoomRatesProps) {
  const { format } = useCurrency()
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null)

  const selectRoom = (key: string) => {
    setSelectedRoom(key)
    onSelectionChange?.(rooms.find((r) => r.key === key) ?? null)
  }

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

      {/*
       * PHASE 30.3 — chaque ligne est une PROPOSITION COMMERCIALE ATOMIQUE :
       * room + board + cancellation + price + CTA restent visuellement DANS
       * le même bloc cliquable (jamais éclatés dans des zones séparées qui
       * pourraient laisser croire qu'une annulation/un prix s'applique à une
       * autre chambre) — seule la DENSITÉ/hiérarchie change ici, jamais la
       * structure de données (room.boardingName reste la source de vérité
       * pour la réservation, jamais un texte parsé/deviné).
       */}
      <div className="divide-border divide-y">
        {rooms.map((room) => (
          <button
            key={room.key}
            type="button"
            onClick={() => selectRoom(room.key)}
            aria-pressed={selectedRoom === room.key}
            className={`hover:bg-muted/30 flex w-full items-start justify-between gap-4 px-4 py-4 text-left transition-colors ${
              selectedRoom === room.key ? "bg-primary/5 border-l-primary border-l-4" : "border-l-4 border-l-transparent"
            }`}
          >
            <div className="flex min-w-0 items-start gap-3">
              <div
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                  selectedRoom === room.key
                    ? "bg-primary border-primary"
                    : "border-border bg-transparent"
                }`}
              >
                {selectedRoom === room.key && (
                  <Check className="text-primary-foreground h-3 w-3" />
                )}
              </div>
              <div className="min-w-0 space-y-1.5">
                <p
                  className={`font-medium ${selectedRoom === room.key ? "text-primary" : "text-foreground"}`}
                >
                  {room.name}
                </p>

                {/* Pension — ligne propre et iconée, séparée du nom de
                    chambre (donnée réelle : room.boardingName). */}
                <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                  <Utensils className="h-3.5 w-3.5 shrink-0" />
                  {room.boardingName}
                </p>

                {/* Annulation — icône dédiée par état, jamais un badge
                    générique unique pour les 3 états. */}
                <p
                  className={`flex items-center gap-1.5 text-xs font-medium ${
                    room.cancellation === "FREE"
                      ? "text-emerald-700"
                      : room.cancellation === "NON_REFUNDABLE"
                        ? "text-muted-foreground"
                        : "text-muted-foreground"
                  }`}
                >
                  {room.cancellation === "FREE" ? (
                    <>
                      <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                      {room.freeCancellationDate
                        ? `Annulation gratuite avant le ${room.freeCancellationDate}`
                        : "Annulation gratuite"}
                    </>
                  ) : room.cancellation === "NON_REFUNDABLE" ? (
                    <>
                      <ShieldOff className="h-3.5 w-3.5 shrink-0" />
                      Non remboursable
                    </>
                  ) : (
                    <>
                      <HelpCircle className="h-3.5 w-3.5 shrink-0" />
                      Conditions d&apos;annulation sur demande
                    </>
                  )}
                </p>

                <span
                  className={`inline-block rounded px-2 py-0.5 text-xs ${
                    room.available
                      ? "bg-muted text-muted-foreground"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {room.available ? "Disponible" : "Sur demande"}
                </span>
              </div>
            </div>
            <span className="text-primary shrink-0 text-lg font-bold whitespace-nowrap">
              {format(room.price)}
            </span>
          </button>
        ))}
      </div>

      {rooms.length > 0 && (
        <div className="bg-muted/30 border-border flex justify-end border-t px-4 py-3">
          <Button
            onClick={() => {
              const selected = rooms.find((r) => r.key === selectedRoom)
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
