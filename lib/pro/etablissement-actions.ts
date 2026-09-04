"use server"

/**
 * Établissement (profil agence B2B) — Server Action d'écriture manquante :
 * components/pro/etablissement-form.tsx lisait déjà les vraies données mais
 * `handleSubmit` se contentait d'un toast d'erreur honnête ("pas encore
 * disponible"), aucune Server Action n'existant. RLS bloquait de toute
 * façon toute écriture avant drizzle/manual/0042 (seule `agencies_admin_write`
 * existait, super_admin uniquement) — voir sa doc de tête.
 *
 * `agencyId` toujours résolu serveur (`getCurrentPartnerProfile`), jamais
 * fourni par le client.
 */

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { withTenantContext } from "@/lib/db/tenant-context"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentPartnerProfile } from "@/lib/auth/partner-profile"
import { updateAgencyProfileCore } from "./etablissement-core"

/** Même format que components/pro/etablissement-form.tsx::MATRICULE_REGEX. */
const MATRICULE_REGEX = /^\d{7}[A-Z]\/[A-Z]\/[A-Z]\/\d{3}$/

const schema = z.object({
  name: z.string().trim().min(1).max(200),
  contactEmail: z.string().trim().email().max(320),
  contactPhone: z.string().trim().max(32).optional().default(""),
  fax: z.string().trim().max(32).optional().default(""),
  matriculeFiscale: z
    .string()
    .trim()
    .max(32)
    .optional()
    .default("")
    .refine((v) => !v || MATRICULE_REGEX.test(v), { message: "Format attendu : 1399210Z/A/M/002" }),
  registreCommerce: z.string().trim().max(64).optional().default(""),
  address: z.string().trim().max(2000).optional().default(""),
  logoUrl: z.string().trim().max(2048).optional().default(""),
  defaultLanguage: z.enum(["fr", "ar", "en", "tr"]),
  defaultCurrency: z.enum(["TND", "EUR", "USD", "DZD"]),
  maskCredit: z.boolean(),
})

export type UpdateEtablissementInput = Omit<z.infer<typeof schema>, "defaultLanguage" | "defaultCurrency"> & {
  defaultLanguage: string
  defaultCurrency: string
}
export type UpdateEtablissementResult = { ok: true } | { ok: false; error: string }

export async function updateMyAgencyProfile(input: UpdateEtablissementInput): Promise<UpdateEtablissementResult> {
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Entrée invalide." }
  }
  if (!process.env.DATABASE_URL) return { ok: false, error: "Service temporairement indisponible." }

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "Session expirée — reconnectez-vous." }

  const profile = await getCurrentPartnerProfile(user.id)
  if (!profile?.agency?.id) return { ok: false, error: "Profil partenaire introuvable." }
  const agencyId = profile.agency.id

  try {
    const result = await withTenantContext({ agencyId, userId: user.id, isSuperAdmin: false }, (tx) =>
      updateAgencyProfileCore(tx, {
        agencyId,
        brandName: parsed.data.name,
        contactEmail: parsed.data.contactEmail,
        contactPhone: parsed.data.contactPhone,
        fax: parsed.data.fax,
        matriculeFiscale: parsed.data.matriculeFiscale,
        registreCommerce: parsed.data.registreCommerce,
        address: parsed.data.address,
        logoUrl: parsed.data.logoUrl,
        defaultLanguage: parsed.data.defaultLanguage,
        defaultCurrency: parsed.data.defaultCurrency,
        maskCredit: parsed.data.maskCredit,
      }),
    )
    if (!result.updated) return { ok: false, error: "Agence introuvable." }
    revalidatePath("/pro/etablissement")
    revalidatePath("/pro")
    return { ok: true }
  } catch (err) {
    console.error("[updateMyAgencyProfile]", err)
    return { ok: false, error: "Erreur technique. Veuillez réessayer." }
  }
}
