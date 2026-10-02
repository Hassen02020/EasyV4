"use server"

/**
 * BRAND-ADMIN-01 — Server Actions pour l'identité du Brand Owner Easy2Book.
 *
 * Écrit uniquement dans l'agence OTA (agencyType='ota', domain IS NULL),
 * résolue côté serveur. Aucun agencyId fourni par le client.
 * Accessible super_admin uniquement.
 */

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { and, asc, eq, isNull } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import { createServerSupabase } from "@/lib/supabase/server"
import { agencies } from "@/lib/db/schema"

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/

const brandSchema = z.object({
  brandName: z.string().trim().min(1).max(200),
  contactEmail: z.string().trim().email().max(320).or(z.literal("")).optional().default(""),
  contactPhone: z.string().trim().max(32).optional().default(""),
  address: z.string().trim().max(2000).optional().default(""),
  logoUrl: z.string().trim().max(2048).optional().default(""),
  primaryColor: z
    .string()
    .trim()
    .max(7)
    .optional()
    .default("")
    .refine((v) => !v || HEX_COLOR_REGEX.test(v), {
      message: "Couleur invalide — format attendu : #RRGGBB",
    }),
  whatsappNumber: z.string().trim().max(32).optional().default(""),
  facebookUrl: z
    .union([z.literal(""), z.string().trim().url().max(2048)])
    .optional()
    .default(""),
  instagramUrl: z
    .union([z.literal(""), z.string().trim().url().max(2048)])
    .optional()
    .default(""),
  tiktokUrl: z
    .union([z.literal(""), z.string().trim().url().max(2048)])
    .optional()
    .default(""),
})

export type BrandInput = z.input<typeof brandSchema>
export type BrandResult = { ok: true } | { ok: false; error: string }

export type BrandInitial = {
  brandName: string
  contactEmail: string
  contactPhone: string
  address: string
  logoUrl: string
  primaryColor: string
  whatsappNumber: string
  facebookUrl: string
  instagramUrl: string
  tiktokUrl: string
}

async function assertSuperAdmin(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  if (!process.env.DATABASE_URL)
    return { ok: false, error: "Service temporairement indisponible." }
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "Session expirée — reconnectez-vous." }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("user_id", user.id)
    .single()
  if (profile?.role !== "super_admin")
    return { ok: false, error: "Accès réservé aux super administrateurs." }

  return { ok: true, userId: user.id }
}

async function resolveOtaAgencyId(): Promise<string | null> {
  try {
    const rows = await withSystemContext((db) =>
      db
        .select({ id: agencies.id })
        .from(agencies)
        .where(and(eq(agencies.agencyType, "ota"), isNull(agencies.domain)))
        .orderBy(asc(agencies.createdAt))
        .limit(1),
    )
    return rows[0]?.id ?? null
  } catch {
    return null
  }
}

export async function getOtaBrandInitial(): Promise<BrandInitial | null> {
  try {
    const rows = await withSystemContext((db) =>
      db
        .select({
          brandName: agencies.brandName,
          contactEmail: agencies.contactEmail,
          contactPhone: agencies.contactPhone,
          address: agencies.address,
          logoUrl: agencies.logoUrl,
          primaryColor: agencies.primaryColor,
          whatsappNumber: agencies.whatsappNumber,
          facebookUrl: agencies.facebookUrl,
          instagramUrl: agencies.instagramUrl,
          tiktokUrl: agencies.tiktokUrl,
        })
        .from(agencies)
        .where(and(eq(agencies.agencyType, "ota"), isNull(agencies.domain)))
        .orderBy(asc(agencies.createdAt))
        .limit(1),
    )
    const row = rows[0]
    if (!row) return null
    return {
      brandName: row.brandName ?? "",
      contactEmail: row.contactEmail ?? "",
      contactPhone: row.contactPhone ?? "",
      address: row.address ?? "",
      logoUrl: row.logoUrl ?? "",
      primaryColor: row.primaryColor ?? "",
      whatsappNumber: row.whatsappNumber ?? "",
      facebookUrl: row.facebookUrl ?? "",
      instagramUrl: row.instagramUrl ?? "",
      tiktokUrl: row.tiktokUrl ?? "",
    }
  } catch {
    return null
  }
}

export async function updateOtaBrand(input: BrandInput): Promise<BrandResult> {
  const auth = await assertSuperAdmin()
  if (!auth.ok) return auth

  const parsed = brandSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Entrée invalide." }
  }

  const agencyId = await resolveOtaAgencyId()
  if (!agencyId) return { ok: false, error: "Agence OTA introuvable." }

  try {
    await withSystemContext((db) =>
      db
        .update(agencies)
        .set({
          brandName: parsed.data.brandName,
          contactEmail: parsed.data.contactEmail || null,
          contactPhone: parsed.data.contactPhone || null,
          address: parsed.data.address || null,
          logoUrl: parsed.data.logoUrl || null,
          primaryColor: parsed.data.primaryColor || null,
          whatsappNumber: parsed.data.whatsappNumber || null,
          facebookUrl: parsed.data.facebookUrl || null,
          instagramUrl: parsed.data.instagramUrl || null,
          tiktokUrl: parsed.data.tiktokUrl || null,
          updatedAt: new Date(),
        })
        .where(eq(agencies.id, agencyId)),
    )

    revalidatePath("/admin/brand")
    revalidatePath("/")
    revalidatePath("/fr")
    revalidatePath("/en")
    revalidatePath("/ar")
    return { ok: true }
  } catch (err) {
    console.error("[updateOtaBrand]", err)
    return { ok: false, error: "Erreur technique. Veuillez réessayer." }
  }
}
