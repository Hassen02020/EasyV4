"use client"

import { useEffect, useState } from "react"
import { createBrowserSupabase } from "@/lib/supabase/client"

export type BroadcastEvent = {
  topic: string
  event: string
  at: number
  payload: Record<string, unknown>
}

/**
 * Souscrit à un canal Supabase Broadcast (indépendant des tables et de RLS).
 *
 * Idéal pour les pages publiques côté Front-Office qui ne sont pas
 * authentifiées (la page de confirmation client par exemple) : RLS empêche
 * la souscription `postgres_changes` car l'utilisateur anonyme n'a aucun
 * droit `SELECT` sur la table. Broadcast est un simple bus de messages,
 * donc utilisable sans authentification.
 *
 * Utilisation typique :
 *   useRealtimeBroadcast(`reservation-${publicRef}`, "status_change", () => {
 *     router.refresh()
 *   })
 */
export function useRealtimeBroadcast(
  topic: string,
  event: string,
  onEvent?: (e: BroadcastEvent) => void,
): BroadcastEvent | null {
  const [lastEvent, setLastEvent] = useState<BroadcastEvent | null>(null)

  useEffect(() => {
    let cancelled = false
    let unsubscribe: (() => void) | null = null
    try {
      const supabase = createBrowserSupabase()
      const channel = supabase.channel(topic, {
        config: { broadcast: { self: false } },
      })
      channel
        .on("broadcast", { event }, (payload) => {
          if (cancelled) return
          const next: BroadcastEvent = {
            topic,
            event,
            at: Date.now(),
            payload: (payload?.payload as Record<string, unknown>) ?? {},
          }
          setLastEvent(next)
          onEvent?.(next)
        })
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
  }, [topic, event, onEvent])

  return lastEvent
}
