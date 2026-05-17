/**
 * Helpers serveur partagés par les pages `/pro/*`.
 *
 * Évitent la duplication du combo `createServerSupabase` +
 * `getCurrentPartnerProfile` + `getMarginsForAgency` que toutes les
 * pages SERP/détail/booking ont besoin pour appliquer les marges.
 *
 * Ce fichier est isolé du runtime client (importe Drizzle + Supabase
 * server). Le pur calcul de marge reste dans `pricing.ts` afin que les
 * composants client puissent y accéder sans tirer pg/fs/net.
 */

import "server-only"

import { and, eq } from "drizzle-orm"

import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentPartnerProfile } from "@/lib/auth/partner-profile"
import { getDb } from "@/lib/db/client"
import { pricingMargins } from "@/lib/db/schema"
import {
  DEFAULT_MARGINS,
  type MarginMap,
  type MarginModule,
  type MarginRule,
} from "./pricing"

/**
 * Récupère la `MarginMap` complète pour une agence donnée. Toujours
 * fusionnée avec les valeurs par défaut afin que chaque module ait une
 * règle, même si la BDD n'a pas (encore) la ligne.
 */
export async function getMarginsForAgency(
  agencyId: string | null | undefined,
): Promise<MarginMap> {
  if (!agencyId || !process.env.DATABASE_URL) return { ...DEFAULT_MARGINS }

  try {
    const db = getDb()
    const rows = await db
      .select({
        module: pricingMargins.module,
        marginType: pricingMargins.marginType,
        marginValue: pricingMargins.marginValue,
        isActive: pricingMargins.isActive,
      })
      .from(pricingMargins)
      .where(
        and(
          eq(pricingMargins.agencyId, agencyId),
          eq(pricingMargins.isActive, true),
        ),
      )

    const map: MarginMap = { ...DEFAULT_MARGINS }
    for (const row of rows) {
      const mod = row.module as MarginModule
      map[mod] = {
        marginType: row.marginType as MarginRule["marginType"],
        marginValue: Number.parseFloat(row.marginValue ?? "0"),
        isActive: row.isActive,
      }
    }
    return map
  } catch (err) {
    console.error("[server-context] getMarginsForAgency failed", err)
    return { ...DEFAULT_MARGINS }
  }
}

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
