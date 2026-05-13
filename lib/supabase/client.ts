/**
 * Client Supabase pour les composants côté navigateur ("use client").
 *
 * Utilisation :
 *   "use client"
 *   import { createBrowserSupabase } from "@/lib/supabase/client"
 *   const supabase = createBrowserSupabase()
 *
 * NE PAS importer dans des Server Components ou Route Handlers — utiliser
 * `createServerSupabase()` (./server.ts) à la place.
 */

import { createBrowserClient } from "@supabase/ssr"

export function createBrowserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY manquant. " +
        "Configure les env vars Supabase dans .env.local (et sur Vercel).",
    )
  }

  return createBrowserClient(url, anonKey)
}
