/**
 * Établissement (profil agence B2B) — moteur central, PAS un fichier
 * `"use server"` (même leçon Phase 38A que les autres modules `-core.ts`).
 *
 * N'écrit JAMAIS les colonnes financières/sensibles de `agencies`
 * (depositBalance, creditLowThreshold, agencyType, status, domain, slug) —
 * seulement les champs de profil que le formulaire /pro/etablissement
 * expose réellement. La protection RLS (drizzle/manual/0042) ne borne que
 * "cette ligne appartient-elle à l'agence courante ?", jamais les colonnes
 * — cette liste explicite EST la protection contre l'écriture de champs
 * non exposés.
 */

import { eq } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import { agencies } from "@/lib/db/schema"

/** Champs texte optionnels : chaîne vide = valeur effacée (jamais confondu avec "ne pas modifier"). */
export interface UpdateAgencyProfileParams {
  agencyId: string
  brandName: string
  contactEmail: string
  contactPhone: string
  fax: string
  matriculeFiscale: string
  registreCommerce: string
  address: string
  logoUrl: string
  defaultLanguage: string
  defaultCurrency: string
  maskCredit: boolean
}

export async function updateAgencyProfileCore(
  tx: DrizzleTransaction,
  params: UpdateAgencyProfileParams,
): Promise<{ updated: boolean }> {
  const updated = await tx
    .update(agencies)
    .set({
      brandName: params.brandName,
      contactEmail: params.contactEmail,
      contactPhone: params.contactPhone || null,
      fax: params.fax || null,
      matriculeFiscale: params.matriculeFiscale || null,
      registreCommerce: params.registreCommerce || null,
      address: params.address || null,
      logoUrl: params.logoUrl || null,
      defaultLanguage: params.defaultLanguage,
      defaultCurrency: params.defaultCurrency,
      maskCredit: params.maskCredit,
      updatedAt: new Date(),
    })
    .where(eq(agencies.id, params.agencyId))
    .returning({ id: agencies.id })

  return { updated: updated.length > 0 }
}
