"use server"

/**
 * Résolution tenant White Label par domaine (Phase 13.1, gap #3 —
 * fondation minimale).
 *
 * `agencies` EST le modèle tenant existant du projet (voir le commentaire
 * de `agencyType` dans lib/db/schema.ts : "ota // OTA Easy2Book elle-même
 * (ou agences en marque blanche)" — anticipé depuis avant cette phase).
 * `domain` (0023_commerce_completion.sql) est la seule colonne manquante
 * pour qu'une agence `agency_type='ota'` serve de tenant marque blanche
 * distinct d'Easy2Book B2C : même produit, même moteur de réservation,
 * juste une agence différente (branding : `brandName`/`logoUrl`/
 * `defaultLanguage`/`defaultCurrency`, déjà présents sur `agencies` depuis
 * avant cette phase — pas de nouvelle colonne "branding" inventée ici).
 *
 * HORS PÉRIMÈTRE, délibérément ("fondation minimale, pas une grosse
 * plateforme") : aucun routage middleware par host n'est câblé sur cette
 * fonction — les pages publiques (`/omra`, `/packages`, `/attractions`)
 * continuent d'utiliser `getDefaultAgencyId()` sans changement de
 * comportement. Documenté comme gap restant dans le rapport, pas
 * silencieusement laissé de côté.
 */

import { eq } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import { agencies } from "@/lib/db/schema"

export interface ResolvedTenant {
  agencyId: string
  name: string
  brandName: string | null
  logoUrl: string | null
  defaultLanguage: string
  defaultCurrency: string
  domain: string
}

/**
 * Normalise un host de requête HTTP ("www.exemple.tn:3000") en domaine
 * comparable à `agencies.domain` ("exemple.tn"). Ne retire QUE "www." et le
 * port — ne devine jamais un domaine, ne fabrique rien.
 */
export function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/^www\./, "").replace(/:\d+$/, "")
}

/**
 * Résout l'agence tenant pour un host donné. Retourne `null` si aucune
 * agence n'a ce domaine enregistré (cas normal pour Easy2Book B2C et pour
 * tout partenaire B2B classique — `domain` reste NULL pour eux).
 */
export async function resolveTenantByDomain(host: string): Promise<ResolvedTenant | null> {
  const normalized = normalizeHost(host)
  if (!normalized) return null
  if (!process.env.DATABASE_URL) return null

  try {
    return await withSystemContext(async (db) => {
      const [row] = await db
        .select({
          id: agencies.id,
          name: agencies.name,
          brandName: agencies.brandName,
          logoUrl: agencies.logoUrl,
          defaultLanguage: agencies.defaultLanguage,
          defaultCurrency: agencies.defaultCurrency,
          domain: agencies.domain,
          status: agencies.status,
        })
        .from(agencies)
        .where(eq(agencies.domain, normalized))
        .limit(1)
      if (!row || row.status !== "active" || !row.domain) return null
      return {
        agencyId: row.id,
        name: row.name,
        brandName: row.brandName,
        logoUrl: row.logoUrl,
        defaultLanguage: row.defaultLanguage,
        defaultCurrency: row.defaultCurrency,
        domain: row.domain,
      }
    })
  } catch {
    return null
  }
}
