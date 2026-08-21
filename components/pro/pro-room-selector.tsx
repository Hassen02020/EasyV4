"use client"

/**
 * Sélection chambre/tarif B2B sur données myGo réelles — Phase 9.
 *
 * Une seule chambre par réservation (même granularité que le flux B2C
 * existant, `components/hotel-listings.tsx::handleBookHotel` — myGo
 * supporte plusieurs chambres par BookingCreation, mais aucun flux de
 * cette application n'implémente encore la réservation multi-chambres en
 * une transaction ; ne pas l'inventer ici).
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { HotelOfferDTO } from "@/lib/mygo/types"

interface RoomRow {
  boardingId: number
  boardingCode: string
  boardingName: string
  roomId: number
  roomName: string
  price: number
  stopReservation: boolean
  notRefundable: boolean
  freeCancellation: boolean
}

function flattenRooms(offer: HotelOfferDTO): RoomRow[] {
  const rows: RoomRow[] = []
  for (const b of offer.boardings) {
    for (const p of b.pax) {
      for (const r of p.rooms) {
        rows.push({
          boardingId: b.id,
          boardingCode: b.code,
          boardingName: b.name,
          roomId: r.id,
          roomName: r.name,
          price: r.price,
          stopReservation: r.stopReservation,
          notRefundable: r.notRefundable,
          freeCancellation: r.cancellationPolicies.some(
            (c) => c.nature === "BEFORE_ARRIVAL" && c.fees === 0,
          ),
        })
      }
    }
  }
  return rows
}

interface ProRoomSelectorProps {
  hotelId: string
  offer: HotelOfferDTO
  searchQuery: {
    cityId: number
    checkin: string
    checkout: string
    adults: number
    children: number[]
  }
}

export function ProRoomSelector({ hotelId, offer, searchQuery }: ProRoomSelectorProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const rows = flattenRooms(offer)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  function keyOf(row: RoomRow) {
    return `${row.boardingId}-${row.roomId}`
  }

  function handleSubmit() {
    const selected = rows.find((r) => keyOf(r) === selectedKey)
    if (!selected) return
    startTransition(() => {
      const params = new URLSearchParams({
        hotelId,
        cityId: String(searchQuery.cityId),
        checkin: searchQuery.checkin,
        checkout: searchQuery.checkout,
        adults: String(searchQuery.adults),
        boardingId: String(selected.boardingId),
        boardingCode: selected.boardingCode,
        roomId: String(selected.roomId),
        myGoToken: offer.token,
        price: String(selected.price),
      })
      if (searchQuery.children.length > 0) {
        params.set("children", searchQuery.children.join(","))
      }
      router.push(`/pro/booking/travelers?${params.toString()}`)
    })
  }

  if (rows.length === 0) {
    return (
      <div className="bg-card shadow-e2b-soft border-border/60 rounded-2xl border p-8 text-center">
        <p className="text-foreground text-sm font-semibold">
          Aucune chambre disponible pour cette offre
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <section
        aria-label="Chambres et tarifs disponibles"
        className="bg-card border-border/60 shadow-e2b-soft rounded-2xl border"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-border/60 bg-muted/30 border-b">
              <tr className="text-muted-foreground text-xs tracking-wide uppercase">
                <th className="px-4 py-3 text-left font-semibold">Chambre</th>
                <th className="px-3 py-3 text-left font-semibold">Pension</th>
                <th className="px-3 py-3 text-left font-semibold">Conditions</th>
                <th className="px-3 py-3 text-right font-semibold">Prix agence</th>
                <th className="px-3 py-3 text-center font-semibold">Choisir</th>
              </tr>
            </thead>
            <tbody className="divide-border/40 divide-y">
              {rows.map((row) => {
                const key = keyOf(row)
                const selected = key === selectedKey
                return (
                  <tr
                    key={key}
                    className={selected ? "bg-primary/5" : "hover:bg-muted/30"}
                  >
                    <td className="text-foreground px-4 py-3 font-medium">
                      {row.roomName}
                    </td>
                    <td className="px-3 py-3">
                      <span className="border-secondary/40 text-secondary bg-secondary/5 inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-semibold">
                        {row.boardingName}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {row.stopReservation ? (
                          <Badge variant="outline" className="border-destructive/40 text-destructive text-[10px]">
                            <XCircle className="mr-1 h-3 w-3" />
                            Sur demande
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-[10px] text-emerald-700">
                            <CheckCircle2 className="mr-1 h-3 w-3" />
                            Disponible
                          </Badge>
                        )}
                        {row.freeCancellation && (
                          <Badge variant="outline" className="border-sky-300 bg-sky-50 text-[10px] text-sky-700">
                            <ShieldCheck className="mr-1 h-3 w-3" />
                            Annulation gratuite
                          </Badge>
                        )}
                        {row.notRefundable && (
                          <Badge variant="outline" className="text-muted-foreground text-[10px]">
                            Non remboursable
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className="text-primary text-base font-bold tabular-nums">
                        {row.price.toLocaleString("fr-FR")} {offer.currency}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <input
                        type="radio"
                        name="room-selection"
                        aria-label={`Sélectionner ${row.roomName} — ${row.boardingName}`}
                        disabled={row.stopReservation}
                        checked={selected}
                        onChange={() => setSelectedKey(key)}
                        className="h-4 w-4"
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="border-border/60 bg-card shadow-e2b-elevated sticky bottom-4 z-30 flex items-center justify-between rounded-2xl border p-3">
        <p className="text-muted-foreground text-xs">
          Le prix et la disponibilité seront revérifiés auprès de l&apos;hôtel
          au moment de la confirmation.
        </p>
        <Button
          type="button"
          size="lg"
          onClick={handleSubmit}
          disabled={!selectedKey || pending}
          className="rounded-xl"
        >
          {pending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
          Suivant
        </Button>
      </div>
    </div>
  )
}
