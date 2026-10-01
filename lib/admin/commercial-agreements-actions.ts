"use server"

/**
 * Gestion des accords commerciaux (`commercial_agreements`) — AGREEMENT-01.
 *
 * Construit le MÉCANISME d'accord (docs/ECONOMIC_MODEL.md §2), réservé à
 * super_admin — [D-01a] "une agence ne peut jamais modifier la part
 * d'Easy2Book". Même pattern EXACT que
 * lib/admin/mutuelle-groups-actions.ts::requireSuperAdmin() (Mutuelle est
 * une autre relation commerciale plateforme, pas une ressource d'agence).
 *
 * Défense en profondeur : cette vérification applicative s'ajoute à la RLS
 * `commercial_agreements_admin_write` (drizzle/manual/0088_agreement_01_rls.sql,
 * `FOR ALL USING/WITH CHECK (is_super_admin())`, sans exception agence) —
 * ni l'une ni l'autre ne suffit seule par convention de ce dépôt.
 *
 * Ce chantier NE CRÉE AUCUNE ligne réelle/permanente (décision Direction,
 * 2026-09-30) : le taux D-01b (option 3, frais sur prix net) n'est pas
 * tranché, et créer un accord réel avec un taux inventé ou "placeholder à
 * 0%" serait fabriquer une politique commerciale, pas construire un
 * mécanisme. Ces actions sont exercées uniquement par les tests (fixture
 * créée puis nettoyée en transaction de test) tant que la Direction n'a
 * pas validé un premier accord réel.
 */

import { revalidatePath } from "next/cache"
import { eq, inArray } from "drizzle-orm"
import { z } from "zod"
import { withTenantContext } from "@/lib/db/tenant-context"
import { commercialAgreements, agencies } from "@/lib/db/schema"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"

async function requireSuperAdmin() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: "Session expirée" }

  const profile = await getCurrentAdminProfile(user.id)
  if (profile?.role !== "super_admin") {
    return { ok: false as const, error: "Seul un super_admin peut gérer les accords commerciaux." }
  }
  return { ok: true as const, user, profile }
}

/* -------------------------------------------------------------------------- */
/* Création d'un accord                                                        */
/* -------------------------------------------------------------------------- */

const partyType = z.enum(["agency", "supplier_node", "easy2book", "external"])

const createAgreementSchema = z.object({
  sellerPartyType: partyType,
  sellerPartyId: z.string().uuid(),
  ownerPartyType: partyType.optional(),
  ownerPartyId: z.string().uuid().optional(),
  supplierPartyType: partyType.optional(),
  supplierPartyId: z.string().uuid().optional(),
  easy2bookRole: z.enum(["platform", "distributor", "seller", "owner"]),
  channel: z.enum(["b2c", "b2b", "network", "white_label", "api"]),
  currency: z.string().trim().length(3).default("TND"),
  payerRole: z.string().trim().min(1).max(50).default("customer"),
  collectorPartyType: partyType.optional(),
  collectorPartyId: z.string().uuid().optional(),
  status: z.enum(["draft", "active", "suspended", "terminated"]).default("draft"),
  validFrom: z.string().optional(),
  validTo: z.string().optional(),
})

export type CreateCommercialAgreementResult =
  | { ok: true; agreementId: string }
  | { ok: false; error: string }

export async function createCommercialAgreement(
  raw: z.infer<typeof createAgreementSchema>,
): Promise<CreateCommercialAgreementResult> {
  const parsed = createAgreementSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: "Entrée invalide : " + parsed.error.errors.map((e) => e.message).join(", ") }
  }
  const input = parsed.data

  const auth = await requireSuperAdmin()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { user } = auth

  try {
    const agreementId = await withTenantContext(
      { agencyId: null, userId: user.id, isSuperAdmin: true },
      async (tx) => {
        const [agreement] = await tx
          .insert(commercialAgreements)
          .values({
            sellerPartyType: input.sellerPartyType,
            sellerPartyId: input.sellerPartyId,
            ownerPartyType: input.ownerPartyType ?? null,
            ownerPartyId: input.ownerPartyId ?? null,
            supplierPartyType: input.supplierPartyType ?? null,
            supplierPartyId: input.supplierPartyId ?? null,
            easy2bookRole: input.easy2bookRole,
            channel: input.channel,
            currency: input.currency.toUpperCase(),
            payerRole: input.payerRole,
            collectorPartyType: input.collectorPartyType ?? null,
            collectorPartyId: input.collectorPartyId ?? null,
            status: input.status,
            validFrom: input.validFrom || null,
            validTo: input.validTo || null,
            createdByUserId: user.id,
          })
          .returning({ id: commercialAgreements.id })

        return agreement.id
      },
    )

    revalidatePath("/admin/accords-commerciaux")
    return { ok: true, agreementId }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue"
    return { ok: false, error: message }
  }
}

/* -------------------------------------------------------------------------- */
/* Statut                                                                       */
/* -------------------------------------------------------------------------- */

export type SetCommercialAgreementStatusResult = { ok: true } | { ok: false; error: string }

export async function setCommercialAgreementStatus(
  agreementId: string,
  status: "draft" | "active" | "suspended" | "terminated",
): Promise<SetCommercialAgreementStatusResult> {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { user } = auth

  try {
    await withTenantContext({ agencyId: null, userId: user.id, isSuperAdmin: true }, async (tx) => {
      const [updated] = await tx
        .update(commercialAgreements)
        .set({ status, updatedAt: new Date() })
        .where(eq(commercialAgreements.id, agreementId))
        .returning({ id: commercialAgreements.id })
      if (!updated) throw new Error("Accord introuvable")
    })
    revalidatePath("/admin/accords-commerciaux")
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erreur inconnue" }
  }
}

/* -------------------------------------------------------------------------- */
/* Lecture                                                                      */
/* -------------------------------------------------------------------------- */

export interface CommercialAgreementRow {
  id: string
  sellerPartyType: string
  sellerPartyId: string
  sellerPartyName: string | null
  ownerPartyType: string | null
  ownerPartyId: string | null
  supplierPartyType: string | null
  supplierPartyId: string | null
  easy2bookRole: string
  channel: string
  currency: string
  payerRole: string
  status: string
  validFrom: string | null
  validTo: string | null
  createdAt: Date
}

/** Réservé super_admin — expose tous les accords, toutes parties confondues
 * (la lecture RLS élargie par accord-partie sert le portail agence, pas
 * cette vue admin cross-tenant). */
export async function listCommercialAgreements(): Promise<CommercialAgreementRow[]> {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return []
  const { user } = auth

  return withTenantContext({ agencyId: null, userId: user.id, isSuperAdmin: true }, async (tx) => {
    const rows = await tx
      .select({
        id: commercialAgreements.id,
        sellerPartyType: commercialAgreements.sellerPartyType,
        sellerPartyId: commercialAgreements.sellerPartyId,
        ownerPartyType: commercialAgreements.ownerPartyType,
        ownerPartyId: commercialAgreements.ownerPartyId,
        supplierPartyType: commercialAgreements.supplierPartyType,
        supplierPartyId: commercialAgreements.supplierPartyId,
        easy2bookRole: commercialAgreements.easy2bookRole,
        channel: commercialAgreements.channel,
        currency: commercialAgreements.currency,
        payerRole: commercialAgreements.payerRole,
        status: commercialAgreements.status,
        validFrom: commercialAgreements.validFrom,
        validTo: commercialAgreements.validTo,
        createdAt: commercialAgreements.createdAt,
      })
      .from(commercialAgreements)
      .orderBy(commercialAgreements.createdAt)

    const agencyIds = Array.from(
      new Set(rows.filter((r) => r.sellerPartyType === "agency").map((r) => r.sellerPartyId)),
    )
    const agencyNames = agencyIds.length
      ? await tx.select({ id: agencies.id, name: agencies.name }).from(agencies).where(inArray(agencies.id, agencyIds))
      : []
    const nameById = new Map(agencyNames.map((a) => [a.id, a.name]))

    return rows.map((r) => ({
      ...r,
      sellerPartyName: r.sellerPartyType === "agency" ? (nameById.get(r.sellerPartyId) ?? null) : null,
    }))
  })
}
