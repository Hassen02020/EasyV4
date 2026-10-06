/**
 * PROMO-01 — définition d'une offre commerciale STRICTEMENT liée à UNE
 * campagne. Répond à UNE seule question — "quelle remise, sous quelles
 * conditions ?" — jamais "quel prix final ?" (PRICING) ni "qui paie
 * quoi ?" (BOOKING/FINANCIAL).
 *
 * Audit de conception dédié (docs/ROADMAP.md) : ce module ne calcule
 * JAMAIS un prix, ne touche JAMAIS `reservations`/`economic_entitlements`,
 * ne lit JAMAIS `contacts`/`lead_consent_events` directement (CAMPAIGN a
 * déjà fait ce travail avant que PROMO n'intervienne).
 *
 * Immutabilité, décision explicite de l'utilisateur appliquée par
 * analogie à `campaigns.message` (CAMPAIGN-EXTENSION-01) : une promo
 * n'est modifiable que tant que la campagne propriétaire est en statut
 * 'draft' — gardée en code (`updatePromoCore`), jamais par un grant DB
 * séparé.
 *
 * `createPromoCore` pose aussi `campaigns.promoRef` dans la même
 * transaction — le pointeur posé dès CAMPAIGN-PERSISTENCE-01 ("posé
 * pour PROMO, jamais construit") devient enfin réel.
 *
 * PAS un fichier `"use server"` (même convention que les autres modules
 * -core.ts de ce dépôt).
 */

import { eq } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import {
  campaigns,
  promos,
  PROMO_DISCOUNT_TYPES,
  type PromoDiscountType,
} from "@/lib/db/schema"
import { getCampaignCore } from "./campaign-persistence-core"

export { PROMO_DISCOUNT_TYPES }
export type { PromoDiscountType }

export interface PromoRow {
  id: string
  agencyId: string
  campaignId: string
  discountType: PromoDiscountType
  discountValue: string
  conditions: string | null
  validFrom: Date | null
  validTo: Date | null
  allowBelowCost: boolean
  createdAt: Date
  updatedAt: Date
}

export type CreatePromoResult =
  | { ok: true; promo: PromoRow }
  | {
      ok: false
      code:
        | "CAMPAIGN_NOT_FOUND"
        | "CAMPAIGN_NOT_DRAFT"
        | "ALREADY_HAS_PROMO"
        | "INVALID_DISCOUNT_TYPE"
    }

/**
 * Une promo ne peut être créée que pour une campagne encore 'draft' —
 * même raisonnement que le gel du message au lancement : l'offre
 * proposée fait partie du contenu réellement montré à la cible,
 * jamais ajustable après coup sans une nouvelle campagne.
 */
export async function createPromoCore(
  tx: DrizzleTransaction,
  params: {
    agencyId: string
    campaignId: string
    discountType: string
    discountValue: string
    conditions?: string | null
    validFrom?: Date | null
    validTo?: Date | null
    allowBelowCost?: boolean
  },
): Promise<CreatePromoResult> {
  if (
    !(PROMO_DISCOUNT_TYPES as readonly string[]).includes(params.discountType)
  ) {
    return { ok: false, code: "INVALID_DISCOUNT_TYPE" }
  }

  const campaign = await getCampaignCore(tx, {
    agencyId: params.agencyId,
    campaignId: params.campaignId,
  })
  if (!campaign) return { ok: false, code: "CAMPAIGN_NOT_FOUND" }
  if (campaign.status !== "draft") {
    return { ok: false, code: "CAMPAIGN_NOT_DRAFT" }
  }
  if (campaign.promoRef) {
    return { ok: false, code: "ALREADY_HAS_PROMO" }
  }

  const [row] = await tx
    .insert(promos)
    .values({
      agencyId: params.agencyId,
      campaignId: params.campaignId,
      discountType: params.discountType,
      discountValue: params.discountValue,
      conditions: params.conditions ?? undefined,
      validFrom: params.validFrom ?? undefined,
      validTo: params.validTo ?? undefined,
      allowBelowCost: params.allowBelowCost ?? undefined,
    })
    .returning()

  await tx
    .update(campaigns)
    .set({ promoRef: row!.id, updatedAt: new Date() })
    .where(eq(campaigns.id, params.campaignId))

  return {
    ok: true,
    promo: { ...row!, discountType: row!.discountType as PromoDiscountType },
  }
}

export async function getPromoForCampaignCore(
  tx: DrizzleTransaction,
  params: { agencyId: string; campaignId: string },
): Promise<PromoRow | null> {
  const [row] = await tx
    .select()
    .from(promos)
    .where(eq(promos.campaignId, params.campaignId))
    .limit(1)

  if (!row || row.agencyId !== params.agencyId) return null
  return { ...row, discountType: row.discountType as PromoDiscountType }
}

export type UpdatePromoResult =
  | { ok: true; promo: PromoRow }
  | { ok: false; code: "PROMO_NOT_FOUND" | "CAMPAIGN_NOT_DRAFT" }

/**
 * Seul point d'édition. Refuse dès que la campagne propriétaire n'est
 * plus 'draft' — même garde que `updateCampaignCore` pour `message`.
 */
export async function updatePromoCore(
  tx: DrizzleTransaction,
  params: {
    agencyId: string
    promoId: string
    discountValue?: string
    conditions?: string | null
    validFrom?: Date | null
    validTo?: Date | null
    allowBelowCost?: boolean
  },
): Promise<UpdatePromoResult> {
  const [existing] = await tx
    .select()
    .from(promos)
    .where(eq(promos.id, params.promoId))
    .limit(1)
  if (!existing || existing.agencyId !== params.agencyId) {
    return { ok: false, code: "PROMO_NOT_FOUND" }
  }

  const campaign = await getCampaignCore(tx, {
    agencyId: params.agencyId,
    campaignId: existing.campaignId,
  })
  if (!campaign || campaign.status !== "draft") {
    return { ok: false, code: "CAMPAIGN_NOT_DRAFT" }
  }

  const [row] = await tx
    .update(promos)
    .set({
      ...(params.discountValue !== undefined
        ? { discountValue: params.discountValue }
        : {}),
      ...(params.conditions !== undefined
        ? { conditions: params.conditions }
        : {}),
      ...(params.validFrom !== undefined
        ? { validFrom: params.validFrom }
        : {}),
      ...(params.validTo !== undefined ? { validTo: params.validTo } : {}),
      ...(params.allowBelowCost !== undefined
        ? { allowBelowCost: params.allowBelowCost }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(promos.id, params.promoId))
    .returning()

  return {
    ok: true,
    promo: { ...row!, discountType: row!.discountType as PromoDiscountType },
  }
}

export type ApplicableDiscountResult =
  | {
      applicable: true
      discountType: PromoDiscountType
      discountValue: string
      allowBelowCost: boolean
    }
  | { applicable: false; reason: "NOT_YET_VALID" | "EXPIRED" }

/**
 * Fonction PURE — ne calcule JAMAIS un prix, renvoie seulement la
 * remise définie, si elle s'applique à `at`, et la politique de vente
 * à perte posée par l'agence (PROMO-LOSS-POLICY-01). PRICING reste seul
 * responsable d'appliquer ce résultat à un prix réel.
 */
export function resolveApplicableDiscountCore(
  promo: Pick<
    PromoRow,
    | "discountType"
    | "discountValue"
    | "validFrom"
    | "validTo"
    | "allowBelowCost"
  >,
  at: Date,
): ApplicableDiscountResult {
  if (promo.validFrom && at.getTime() < promo.validFrom.getTime()) {
    return { applicable: false, reason: "NOT_YET_VALID" }
  }
  if (promo.validTo && at.getTime() > promo.validTo.getTime()) {
    return { applicable: false, reason: "EXPIRED" }
  }
  return {
    applicable: true,
    discountType: promo.discountType,
    discountValue: promo.discountValue,
    allowBelowCost: promo.allowBelowCost,
  }
}
