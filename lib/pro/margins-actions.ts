"use server"

/**
 * Marges de vente — Server Actions d'écriture sur `pricing_margins` (voir
 * la doc de tête de margins-core.ts pour pourquoi cette table précisément,
 * et pas `yieldRules`/`marginRules`).
 *
 * Deux points d'entrée distincts, même garde de fond que les autres
 * modules `/pro` vs `/admin` de ce projet :
 *  - `upsertMyPricingMargin` : le partenaire authentifié édite SA PROPRE
 *    agence — `agencyId` toujours résolu serveur (`getCurrentPartnerProfile`),
 *    jamais fourni par le client.
 *  - `upsertAgencyPricingMargin` : le super_admin édite l'agence de son
 *    choix (vue cross-agence /admin/marges) — même garde que
 *    `assertAdminForYield` (lib/yield/actions.ts).
 */

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { withTenantContext, resolveSessionContext } from "@/lib/db/tenant-context"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentPartnerProfile } from "@/lib/auth/partner-profile"
import { invalidateMarginsCache } from "./server-context"
import { upsertPricingMarginCore } from "./margins-core"

// omra/package/activity retirés : ces modules n'ont pas de coût net séparé
// du prix de vente (l'agence fixe directement le prix au niveau du
// catalogue produit) — voir le commentaire détaillé sur MarginModule
// (lib/pro/pricing.ts). Car reste hors périmètre (module non
// commercialisable, voir EASYV4_CAR_DECISION.md).
const MarginInputSchema = z.object({
  module: z.enum(["hotel", "flight", "transfer"]),
  marginType: z.enum(["percent", "fixed"]),
  marginValue: z.coerce.number().min(0).max(1000),
  isActive: z.boolean(),
})

export type MarginActionInput = z.infer<typeof MarginInputSchema>
export type MarginActionResult = { ok: true; id: string } | { ok: false; error: string }

/**
 * Partenaire authentifié — édite la marge d'un module pour SA PROPRE
 * agence uniquement.
 */
export async function upsertMyPricingMargin(input: MarginActionInput): Promise<MarginActionResult> {
  const parsed = MarginInputSchema.safeParse(input)
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
    const result = await withTenantContext(
      { agencyId, userId: user.id, isSuperAdmin: false },
      (tx) => upsertPricingMarginCore(tx, { agencyId, ...parsed.data }),
    )
    await invalidateMarginsCache(agencyId)
    revalidatePath("/pro/marges")
    return { ok: true, id: result.id }
  } catch (err) {
    console.error("[upsertMyPricingMargin]", err)
    return { ok: false, error: "Erreur technique. Veuillez réessayer." }
  }
}

const AdminMarginInputSchema = MarginInputSchema.extend({
  agencyId: z.string().uuid(),
})
export type AdminMarginActionInput = z.infer<typeof AdminMarginInputSchema>

/**
 * super_admin — édite la marge de l'agence partenaire de son choix (vue
 * cross-agence /admin/marges). Même garde que lib/yield/actions.ts
 * (resolveSessionContext + isSuperAdmin), jamais un rôle fourni par le
 * client.
 */
export async function upsertAgencyPricingMargin(input: AdminMarginActionInput): Promise<MarginActionResult> {
  const session = await resolveSessionContext()
  if (!session.ok) return { ok: false, error: "Non authentifié" }
  if (!session.isSuperAdmin) return { ok: false, error: "Accès refusé : rôle super_admin requis" }

  const parsed = AdminMarginInputSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Entrée invalide." }
  }
  if (!process.env.DATABASE_URL) return { ok: false, error: "Service temporairement indisponible." }

  try {
    const result = await withTenantContext(
      { agencyId: null, userId: session.userId, isSuperAdmin: true },
      (tx) => upsertPricingMarginCore(tx, parsed.data),
    )
    await invalidateMarginsCache(parsed.data.agencyId)
    revalidatePath("/admin/marges")
    revalidatePath("/pro/marges")
    return { ok: true, id: result.id }
  } catch (err) {
    console.error("[upsertAgencyPricingMargin]", err)
    return { ok: false, error: "Erreur technique. Veuillez réessayer." }
  }
}
