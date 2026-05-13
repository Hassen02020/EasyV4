/**
 * Client Supabase pour Server Components, Server Actions et Route Handlers.
 *
 * Utilisation :
 *   import { createServerSupabase } from "@/lib/supabase/server"
 *   const supabase = await createServerSupabase()
 *   const { data: { user } } = await supabase.auth.getUser()
 *
 * IMPORTANT : ne JAMAIS importer ce module côté client — il utilise `next/headers`
 * qui n'existe que côté serveur.
 */

import { cookies } from "next/headers"
import { createServerClient, type CookieMethodsServer } from "@supabase/ssr"

export async function createServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY manquant.",
    )
  }

  const cookieStore = await cookies()

  const cookieMethods: CookieMethodsServer = {
    getAll() {
      return cookieStore.getAll()
    },
    setAll(cookiesToSet) {
      try {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options)
        }
      } catch {
        // setAll échoue dans un Server Component (cookies en lecture seule).
        // Le middleware se charge de rafraîchir la session côté response,
        // donc l'erreur est sans conséquence ici.
      }
    },
  }

  return createServerClient(url, anonKey, { cookies: cookieMethods })
}

/**
 * Client Supabase "service role" — bypass RLS, à utiliser UNIQUEMENT dans des
 * actions serveur de confiance (seed, jobs cron, webhooks PSP, etc.) après avoir
 * validé que l'appelant a les droits requis.
 *
 * Ne JAMAIS exposer la service role key côté client.
 */
export function createServiceRoleSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquant.",
    )
  }

  return createServerClient(url, serviceKey, {
    cookies: {
      getAll() {
        return []
      },
      setAll() {
        // no-op : service role ne touche pas aux cookies
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
