import "server-only"

/**
 * Résolution tenant White Label par domaine (Phase 13.1, gap #3 —
 * fondation minimale ; Phase 13.2, câblage runtime).
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
 * Phase 13.2 : le chemin RUNTIME réel (proxy.ts → getDefaultAgencyId())
 * n'utilise PAS cette fonction — `proxy.ts` tourne sur l'Edge runtime, qui
 * ne supporte pas la connexion Postgres directe de Drizzle (le driver
 * `postgres` a besoin de `net`/`tls`, absents côté Edge — même classe de
 * bug déjà rencontrée et corrigée en Phase 13 pour `product-guard.ts`).
 * `proxy.ts` fait donc sa propre résolution, via le client Supabase déjà
 * utilisé là-bas pour la garde RBAC `/admin` (PostgREST, HTTP, donc
 * Edge-safe), et propage le résultat via un header de requête que
 * `lib/agencies/default-agency.ts::getDefaultAgencyId()` lit ensuite.
 * `resolveTenantByDomain` (Drizzle, ce fichier) reste un utilitaire
 * Node-only disponible pour du code serveur qui tourne déjà hors Edge
 * (Server Component, script) — pas dupliqué sans raison : ce sont deux
 * couches d'accès BDD différentes pour deux runtimes différents, pas deux
 * fois la même logique métier (la requête elle-même est un simple
 * `agencies.domain = ?`).
 */

import { eq } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import { agencies } from "@/lib/db/schema"
import { normalizeHost } from "./host"

export { normalizeHost }

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
