"use client"

import { useEffect, useState } from "react"
import { createBrowserSupabase } from "@/lib/supabase/client"

export type RealtimeEvent = {
  table: string
  type: "INSERT" | "UPDATE" | "DELETE"
  at: number
  newRow?: Record<string, unknown> | null
  oldRow?: Record<string, unknown> | null
}

/**
 * Souscription Realtime Supabase générique : émet un event à chaque insert /
 * update / delete sur la table fournie.
 *
 * Utilisation typique :
 *   useRealtimeTable("reservations", (e) => {
 *     router.refresh()
 *     toast.success(`Nouvelle réservation ${e.newRow?.public_ref}`)
 *   })
 *
 * Renvoie également `lastEvent` qui peut servir de clé `useEffect` ailleurs
 * pour relancer un refetch sans state global.
 */
export function useRealtimeTable(
  table: string,
  onEvent?: (e: RealtimeEvent) => void,
): RealtimeEvent | null {
  const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null)

  useEffect(() => {
    let cancelled = false
    let unsubscribe: (() => void) | null = null
    try {
      const supabase = createBrowserSupabase()
      const channel = supabase
        .channel(`tg-rt-${table}`)
        .on(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase typings narrow at runtime
          "postgres_changes" as any,
          { event: "*", schema: "public", table },
          (payload: {
            eventType: "INSERT" | "UPDATE" | "DELETE"
            new: Record<string, unknown> | null
            old: Record<string, unknown> | null
          }) => {
            if (cancelled) return
            const event: RealtimeEvent = {
              table,
              type: payload.eventType,
              at: Date.now(),
              newRow: payload.new,
              oldRow: payload.old,
            }
            setLastEvent(event)
            onEvent?.(event)
          },
        )
        .subscribe()
      unsubscribe = () => {
        try {
          supabase.removeChannel(channel)
        } catch {
          /* no-op */
        }
      }
    } catch {
      /* env not configured — silent no-op */
    }
    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [table, onEvent])

  return lastEvent
}
