/**
 * Récupère le profil étendu d'un utilisateur partenaire B2B + son agence.
 *
 * Utilisé par le layout `/pro/*` pour :
 *  - vérifier que l'utilisateur a bien un rôle `partner_owner` ou `partner_agent`
 *  - charger l'agence partenaire (matricule, solde de crédit, langue, devise…)
 *
 * En mode "vue B2B simulée" (super_admin qui visite /pro), on retourne la 1ʳᵉ
 * agence de type `partner` trouvée — pratique pour démonstrations/UAT.
 */

import { and, eq } from "drizzle-orm"

import { getDb } from "@/lib/db/client"
import { agencies, users } from "@/lib/db/schema"

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

    // 1. Charge le user + son agence
    const rows = await db
      .select({
        userId: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        userStatus: users.status,
        userAgencyId: users.agencyId,
        agency: {
          id: agencies.id,
          slug: agencies.slug,
          name: agencies.name,
          brandName: agencies.brandName,
          agencyType: agencies.agencyType,
          matriculeFiscale: agencies.matriculeFiscale,
          registreCommerce: agencies.registreCommerce,
          address: agencies.address,
          contactEmail: agencies.contactEmail,
          contactPhone: agencies.contactPhone,
          fax: agencies.fax,
          logoUrl: agencies.logoUrl,
          defaultLanguage: agencies.defaultLanguage,
          defaultCurrency: agencies.defaultCurrency,
          maskCredit: agencies.maskCredit,
          depositBalance: agencies.depositBalance,
          creditLowThreshold: agencies.creditLowThreshold,
        },
      })
      .from(users)
      .leftJoin(agencies, eq(users.agencyId, agencies.id))
      .where(eq(users.id, userId))
      .limit(1)

    const row = rows[0]
    if (!row || row.userStatus !== "active") return null

    const isPartnerRole =
      row.role === "partner_owner" || row.role === "partner_agent"

    // Cas 1 : utilisateur partenaire B2B classique
    if (isPartnerRole && row.agency) {
      return {
        userId: row.userId,
        email: row.email,
        name: row.name,
        role: row.role as PartnerRole,
        isAdminPreview: false,
        agency: {
          id: row.agency.id!,
          slug: row.agency.slug!,
          name: row.agency.name!,
          brandName: row.agency.brandName,
          matriculeFiscale: row.agency.matriculeFiscale,
          registreCommerce: row.agency.registreCommerce,
          address: row.agency.address,
          contactEmail: row.agency.contactEmail,
          contactPhone: row.agency.contactPhone,
          fax: row.agency.fax,
          logoUrl: row.agency.logoUrl,
          defaultLanguage: row.agency.defaultLanguage ?? "fr",
          defaultCurrency: row.agency.defaultCurrency ?? "TND",
          maskCredit: row.agency.maskCredit ?? false,
          depositBalance: row.agency.depositBalance ?? "0",
          creditLowThreshold: row.agency.creditLowThreshold ?? "100.00",
        },
      }
    }

    // Cas 2 : super_admin qui visite /pro → on tombe sur la 1ʳᵉ agence partenaire
    // pour démonstration (mode "vue B2B simulée").
    if (row.role === "super_admin") {
      const partnerAgencies = await db
        .select()
        .from(agencies)
        .where(
          and(
            eq(agencies.agencyType, "partner"),
            eq(agencies.status, "active"),
          ),
        )
        .limit(1)

      const partnerAgency = partnerAgencies[0]
      if (!partnerAgency) return null

      return {
        userId: row.userId,
        email: row.email,
        name: row.name,
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
    }

    // Autres rôles (manager, agent_resa, etc.) → pas d'accès /pro
    return null
  } catch (error) {
    console.warn(
      "[getCurrentPartnerProfile] DB lookup failed:",
      error instanceof Error ? error.message : error,
    )
    return null
  }
}
