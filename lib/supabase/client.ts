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

  if (!url || !anonKey || url === "http://localhost:54321") {
    // Mode démo sans Supabase - retourne un mock client
    console.warn(
      "[Supabase] Mode démo - Supabase non configuré. Auth désactivé.",
    )
    return createMockSupabaseClient()
  }

  return createBrowserClient(url, anonKey)
}

/**
 * Mock client pour le développement local sans Supabase
 */
function createMockSupabaseClient() {
  return {
    auth: {
      signInWithPassword: async () => ({
        data: { user: { id: "demo-user", email: "demo@easy2book.tn" } },
        error: null,
      }),
      signOut: async () => ({ error: null }),
      getUser: async () => ({ data: { user: null }, error: null }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
    },
  } as ReturnType<typeof createBrowserClient>
}
