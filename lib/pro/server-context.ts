/**
 * Helpers serveur partagés par les pages `/pro/*`.
 *
 * Évitent la duplication du combo `createServerSupabase` +
 * `getCurrentPartnerProfile` + `getMarginsForAgency` que toutes les
 * pages SERP/détail/booking ont besoin pour appliquer les marges.
 */

import "server-only"

import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentPartnerProfile } from "@/lib/auth/partner-profile"
import { DEFAULT_MARGINS, getMarginsForAgency, type MarginMap } from "./pricing"

/**
 * Retourne la `MarginMap` à appliquer aux prix affichés pour la session
 * courante. Si l'utilisateur n'est pas authentifié (preview public) ou
 * si la BDD n'est pas disponible, retourne les marges par défaut afin
 * que les pages restent affichables en démo.
 */
export async function getActivePartnerMargins(): Promise<MarginMap> {
  try {
    const supabase = await createServerSupabase()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ...DEFAULT_MARGINS }
    const profile = await getCurrentPartnerProfile(user.id)
    if (!profile) return { ...DEFAULT_MARGINS }
    return await getMarginsForAgency(profile.agency.id)
  } catch (err) {
    console.error("[server-context] getActivePartnerMargins failed", err)
    return { ...DEFAULT_MARGINS }
  }
}
