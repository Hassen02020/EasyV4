/**
 * Récupère le profil étendu d'un utilisateur partenaire B2B + son agence.
 *
 * Utilisé par le layout `/pro/*` pour :
 *  - vérifier que l'utilisateur a bien un rôle `partner_owner` ou `partner_agent`
 *  - charger l'agence partenaire (matricule, solde de crédit, langue, devise…)
 *
 * En mode "vue B2B simulée" (super_admin qui visite /pro), on retourne la 1ʳᵉ
 * agence de type `partner` trouvée — pratique pour démonstrations/UAT.
 *
 * CRITICAL (trouvé pendant le stress test — Phase 2) : la version précédente
 * faisait un SELECT direct sur `users`/`agencies` via `getDb()` (connexion
 * directe, `auth.uid()` ne résout jamais). Depuis que `FORCE ROW LEVEL
 * SECURITY` est actif en production, cette fonction renvoyait `null` pour
 * TOUT utilisateur, TOUJOURS — et `app/pro/(app)/layout.tsx` fait
 * `if (!profile) redirect("/admin")`. Résultat réel en production : le
 * portail B2B entier était inaccessible, pour tout le monde. Corrigé en deux
 * temps : (1) résolution d'identité minimale via `resolve_session_context()`
 * (SQL SECURITY DEFINER, contourne volontairement RLS pour ce seul
 * bootstrap — voir lib/db/tenant-context.ts), (2) le reste de la requête
 * (agence complète, ou recherche de la 1ʳᵉ agence partenaire en mode
 * preview) s'exécute dans `withTenantContext()`, donc sous RLS normal une
 * fois le contexte posé.
 */

import { and, eq } from "drizzle-orm"

import { getDb } from "@/lib/db/client"
import { withTenantContext } from "@/lib/db/tenant-context"
import { sql } from "drizzle-orm"
import { agencies } from "@/lib/db/schema"

export type PartnerRole = "partner_owner" | "partner_agent" | "super_admin"

export type PartnerProfile = {
  userId: string
  email: string
  name: string | null
  role: PartnerRole
  /** Indique si l'utilisateur est un super_admin qui consulte /pro en simulation. */
  isAdminPreview: boolean
  agency: {
    id: string
    slug: string
    name: string
    brandName: string | null
    matriculeFiscale: string | null
    registreCommerce: string | null
    address: string | null
    contactEmail: string | null
    contactPhone: string | null
    fax: string | null
    logoUrl: string | null
    defaultLanguage: string
    defaultCurrency: string
    maskCredit: boolean
    depositBalance: string
    creditLowThreshold: string
  }
}

export async function getCurrentPartnerProfile(
  userId: string,
): Promise<PartnerProfile | null> {
  if (!userId) return null
  if (!process.env.DATABASE_URL) return null

  try {
    const db = getDb()

    // 1. Résolution d'identité minimale (bootstrap RLS — voir commentaire
    //    de tête). Ne renvoie PAS l'agence complète : juste de quoi savoir
    //    qui pose le contexte tenant à l'étape 2.
    const identityRows = (await db.execute(
      sql`select * from resolve_session_context(${userId}::uuid)`,
    )) as Array<{
      agency_id: string | null
      role: string | null
      status: string | null
      email: string | null
      name: string | null
    }>
    const identity = identityRows[0]
    if (!identity || identity.status !== "active") return null

    const isPartnerRole =
      identity.role === "partner_owner" || identity.role === "partner_agent"
    const isSuperAdmin = identity.role === "super_admin"

    if (!isPartnerRole && !isSuperAdmin) {
      // Autres rôles (manager, agent_resa, etc.) → pas d'accès /pro
      return null
    }

    // 2. Cas 1 : utilisateur partenaire B2B classique — charge son agence
    //    dans le contexte tenant posé sur sa propre agencyId (RLS normale :
    //    agencies_select autorise id = current_agency_id()).
    if (isPartnerRole) {
      if (!identity.agency_id) return null
      const agencyRow = await withTenantContext(
        { agencyId: identity.agency_id, userId, isSuperAdmin: false },
        (tx) =>
          tx
            .select()
            .from(agencies)
            .where(eq(agencies.id, identity.agency_id as string))
            .limit(1),
      )
      const agency = agencyRow[0]
      if (!agency) return null

      return {
        userId,
        email: identity.email ?? "",
        name: identity.name,
        role: identity.role as PartnerRole,
        isAdminPreview: false,
        agency: {
          id: agency.id,
          slug: agency.slug,
          name: agency.name,
          brandName: agency.brandName,
          matriculeFiscale: agency.matriculeFiscale,
          registreCommerce: agency.registreCommerce,
          address: agency.address,
          contactEmail: agency.contactEmail,
          contactPhone: agency.contactPhone,
          fax: agency.fax,
          logoUrl: agency.logoUrl,
          defaultLanguage: agency.defaultLanguage ?? "fr",
          defaultCurrency: agency.defaultCurrency ?? "TND",
          maskCredit: agency.maskCredit ?? false,
          depositBalance: agency.depositBalance ?? "0",
          creditLowThreshold: agency.creditLowThreshold ?? "100.00",
        },
      }
    }

    // 3. Cas 2 : super_admin qui visite /pro → on tombe sur la 1ʳᵉ agence
    //    partenaire pour démonstration (mode "vue B2B simulée"). Nécessite
    //    is_super_admin=true : cette lecture n'est pas scopée à une seule
    //    agence, RLS ne l'autorise que via le bypass super_admin.
    const partnerAgencies = await withTenantContext(
      { agencyId: null, userId, isSuperAdmin: true },
      (tx) =>
        tx
          .select()
          .from(agencies)
          .where(
            and(
              eq(agencies.agencyType, "partner"),
              eq(agencies.status, "active"),
            ),
          )
          .limit(1),
    )

    const partnerAgency = partnerAgencies[0]
    if (!partnerAgency) return null

    return {
      userId,
      email: identity.email ?? "",
      name: identity.name,
      role: "super_admin",
      isAdminPreview: true,
      agency: {
        id: partnerAgency.id,
        slug: partnerAgency.slug,
        name: partnerAgency.name,
        brandName: partnerAgency.brandName,
        matriculeFiscale: partnerAgency.matriculeFiscale,
        registreCommerce: partnerAgency.registreCommerce,
        address: partnerAgency.address,
        contactEmail: partnerAgency.contactEmail,
        contactPhone: partnerAgency.contactPhone,
        fax: partnerAgency.fax,
        logoUrl: partnerAgency.logoUrl,
        defaultLanguage: partnerAgency.defaultLanguage,
        defaultCurrency: partnerAgency.defaultCurrency,
        maskCredit: partnerAgency.maskCredit,
        depositBalance: partnerAgency.depositBalance,
        creditLowThreshold: partnerAgency.creditLowThreshold,
      },
    }
  } catch (error) {
    const { logger } = await import("@/lib/logger")
    logger.warn("[getCurrentPartnerProfile] DB lookup failed", {
      code: error instanceof Error ? error.constructor.name : "unknown",
    })
    return null
  }
}
