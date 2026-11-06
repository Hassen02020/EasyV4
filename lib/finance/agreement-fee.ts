/**
 * COMMERCIAL-AGREEMENT-WIRING-01 — part Easy2Book issue d'un accord
 * commercial ACTIF (option 3, D-01b, docs/ECONOMIC_MODEL.md §2 et §10).
 *
 * COMMERCIAL-AGREEMENT-MODELS-02 — décision Direction (2026-11-06), appliquée
 * strictement :
 *   - nouveaux accords Network → POURCENTAGE du prix net fournisseur
 *     (seule forme acceptée : `margin_rules.type = 'percent'`, taux > 0 écrit
 *     par le super_admin ; frais fixes / hybrides refusés) ;
 *   - hôtels Tunisie historiques → pourcentage de la marge vendeur
 *     (`commissionPercent`, option 1) : JAMAIS résolus par un accord ici.
 *   - aucun taux par défaut, aucun taux arbitraire (ni 10 %, ni 0 %) : le
 *     premier taux Network est décidé par la Direction.
 *
 * Où vit le taux : `commercial_agreements` ne porte aucun montant ; le
 * « combien » vit dans une ligne `margin_rules` rattachée par
 * `margin_rules.agreement_id` (AGREEMENT-01, migration 0089) — exactement
 * la réutilisation prévue par ECONOMIC_MODEL §2. Aucune migration.
 *
 * Règles (toutes codées ici, toutes testées) :
 *  - Résolution déterministe : vendeur (agence) + canal + module + date de
 *    confirmation (fuseau Africa/Tunis) + statut `active`. Un accord dont le
 *    propriétaire/fournisseur est une partie précise ne s'applique qu'à une
 *    vente portant cette même partie.
 *  - Aucun accord applicable → `null` → comportement actuel STRICTEMENT
 *    inchangé (option 1 `commissionPercent`).
 *  - Deux accords applicables, ou deux lignes de taux de même priorité →
 *    REFUS explicite (`AgreementFeeError`), jamais un choix arbitraire.
 *  - Devise de l'accord ≠ TND → REFUS, jamais de conversion (règle
 *    permanente « Taux de change », CLAUDE.md).
 *  - Ligne de taux à périmètre non géré ici (fournisseur, destination,
 *    seuils de prix) ou ambiguë (commissionPercent renseigné en plus) →
 *    REFUS plutôt qu'une interprétation silencieuse.
 *  - Aucun taux par défaut, aucun repli inventé : seul le taux écrit par le
 *    super_admin dans la ligne rattachée à l'accord est utilisé.
 *
 * Arrondi : 2 décimales, comme TOUTES les colonnes de montant concernées
 * (`economic_entitlements.amount`, `reservation_financials.commission_amount`
 * sont en numeric(14,2)) et comme la formule option 1 existante. Un
 * stockage au millime exigerait une migration séparée (hors périmètre).
 */

import { and, eq, inArray } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import { commercialAgreements } from "@/lib/db/schema"
import { marginRules } from "@/lib/db/schema/financials"

export type AgreementChannel = "b2c" | "b2b" | "network" | "white_label" | "api"

/** Seul module monétisé par accord (décision Direction 2026-11-06). */
export const AGREEMENT_MODULES = ["network"] as const
export type AgreementModule = (typeof AGREEMENT_MODULES)[number]

export interface AgreementFeeContext {
  /** Agence vendeuse (`agencies.id`) — partie `seller` de l'accord. */
  sellerAgencyId: string
  channel: AgreementChannel
  /** Module de la réservation, comparé à `margin_rules.product_type`. Network uniquement. */
  module: AgreementModule
  /** Date du fait générateur (confirmation, D-01c). Défaut : maintenant. */
  at?: Date
  /** Parties précises de la vente, si connues (null = non modélisées). */
  ownerPartyId?: string | null
  supplierPartyId?: string | null
}

export interface ResolvedAgreementRule {
  agreementId: string
  ruleId: string
  type: "percent" | "fixed" | "hybrid"
  percentValue: number | null
  fixedValue: number | null
}

export type AgreementFeeErrorCode =
  | "AGREEMENT_MODULE_NOT_ALLOWED"
  | "AGREEMENT_CONFLICT"
  | "AGREEMENT_RULE_CONFLICT"
  | "AGREEMENT_CURRENCY_UNSUPPORTED"
  | "AGREEMENT_RULE_UNSUPPORTED_SCOPE"
  | "AGREEMENT_RULE_INVALID"
  | "AGREEMENT_FEE_EXCEEDS_SELLER_MARGIN"
  | "AGREEMENT_ENTITLEMENT_SHAPE"

export class AgreementFeeError extends Error {
  constructor(
    public readonly code: AgreementFeeErrorCode,
    detail: string,
  ) {
    super(`${code}: ${detail}`)
    this.name = "AgreementFeeError"
  }
}

/** Date calendaire (YYYY-MM-DD) au fuseau de la plateforme (Tunisie). */
export function tunisDate(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Tunis",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at)
}

function withinValidity(
  day: string,
  validFrom: string | null,
  validTo: string | null,
): boolean {
  if (validFrom && day < validFrom) return false
  if (validTo && day > validTo) return false
  return true
}

const num = (v: string | null): number | null =>
  v === null ? null : Number.parseFloat(v)

/**
 * Retrouve LA ligne de taux d'accord applicable à une vente, ou `null`.
 * Lit sous le contexte de la transaction appelante : la RLS
 * (`commercial_agreements_party_read`, `margin_rules_tenant_isolation`)
 * laisse l'agence vendeuse lire ses propres accords et lignes de taux.
 */
export async function resolveActiveAgreementRule(
  tx: DrizzleTransaction,
  ctx: AgreementFeeContext,
): Promise<ResolvedAgreementRule | null> {
  // Défense en profondeur (le type l'interdit déjà) : les hôtels Tunisie
  // restent sur l'option 1, jamais sur un accord.
  if (!(AGREEMENT_MODULES as readonly string[]).includes(ctx.module)) {
    throw new AgreementFeeError(
      "AGREEMENT_MODULE_NOT_ALLOWED",
      `module ${ctx.module} : la part Easy2Book par accord est réservée au module Network.`,
    )
  }
  const day = tunisDate(ctx.at ?? new Date())

  const agreements = (
    await tx
      .select({
        id: commercialAgreements.id,
        currency: commercialAgreements.currency,
        validFrom: commercialAgreements.validFrom,
        validTo: commercialAgreements.validTo,
        ownerPartyId: commercialAgreements.ownerPartyId,
        supplierPartyId: commercialAgreements.supplierPartyId,
      })
      .from(commercialAgreements)
      .where(
        and(
          eq(commercialAgreements.sellerPartyType, "agency"),
          eq(commercialAgreements.sellerPartyId, ctx.sellerAgencyId),
          eq(commercialAgreements.channel, ctx.channel),
          eq(commercialAgreements.status, "active"),
        ),
      )
  ).filter(
    (a) =>
      withinValidity(day, a.validFrom, a.validTo) &&
      (a.ownerPartyId === null || a.ownerPartyId === ctx.ownerPartyId) &&
      (a.supplierPartyId === null || a.supplierPartyId === ctx.supplierPartyId),
  )
  if (agreements.length === 0) return null

  const rules = (
    await tx
      .select({
        id: marginRules.id,
        agreementId: marginRules.agreementId,
        agencyId: marginRules.agencyId,
        productType: marginRules.productType,
        supplierId: marginRules.supplierId,
        destination: marginRules.destination,
        minPrice: marginRules.minPrice,
        maxPrice: marginRules.maxPrice,
        type: marginRules.type,
        percentValue: marginRules.percentValue,
        fixedValue: marginRules.fixedValue,
        commissionPercent: marginRules.commissionPercent,
        priority: marginRules.priority,
        validFrom: marginRules.validFrom,
        validTo: marginRules.validTo,
      })
      .from(marginRules)
      .where(
        and(
          inArray(
            marginRules.agreementId,
            agreements.map((a) => a.id),
          ),
          eq(marginRules.agencyId, ctx.sellerAgencyId),
          eq(marginRules.isActive, true),
        ),
      )
  ).filter(
    (r) =>
      withinValidity(day, r.validFrom, r.validTo) &&
      (r.productType === null || r.productType === ctx.module),
  )

  // Un accord ne s'applique à ce module que s'il porte une ligne de taux
  // pour lui : un accord « Omra » n'impose rien à une vente hôtel.
  const applicableAgreementIds = [...new Set(rules.map((r) => r.agreementId))]
  if (applicableAgreementIds.length === 0) return null
  if (applicableAgreementIds.length > 1) {
    throw new AgreementFeeError(
      "AGREEMENT_CONFLICT",
      `${applicableAgreementIds.length} accords actifs applicables (vendeur=${ctx.sellerAgencyId}, canal=${ctx.channel}, module=${ctx.module}, date=${day}).`,
    )
  }
  const agreement = agreements.find((a) => a.id === applicableAgreementIds[0])!
  if (agreement.currency !== "TND") {
    throw new AgreementFeeError(
      "AGREEMENT_CURRENCY_UNSUPPORTED",
      `accord ${agreement.id} en ${agreement.currency} — aucune conversion n'est faite.`,
    )
  }

  const top = Math.max(...rules.map((r) => r.priority))
  const best = rules.filter((r) => r.priority === top)
  if (best.length > 1) {
    throw new AgreementFeeError(
      "AGREEMENT_RULE_CONFLICT",
      `${best.length} lignes de taux de même priorité (${top}) pour l'accord ${agreement.id}.`,
    )
  }
  const rule = best[0]!
  if (
    rule.supplierId !== null ||
    rule.destination !== null ||
    rule.minPrice !== null ||
    rule.maxPrice !== null ||
    rule.commissionPercent !== null
  ) {
    throw new AgreementFeeError(
      "AGREEMENT_RULE_UNSUPPORTED_SCOPE",
      `ligne ${rule.id} : fournisseur/destination/seuils/commissionPercent non gérés pour un accord (option 3).`,
    )
  }

  const resolved: ResolvedAgreementRule = {
    agreementId: agreement.id,
    ruleId: rule.id,
    type: rule.type,
    percentValue: num(rule.percentValue),
    fixedValue: num(rule.fixedValue),
  }
  // Valide la ligne dès la résolution (refus avant toute écriture).
  computeAgreementFee(0, resolved)
  return resolved
}

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100

/**
 * Part Easy2Book option 3, modèle Network : `prix net fournisseur × taux %`.
 * Seule forme acceptée (décision Direction 2026-11-06) : frais fixes,
 * formule hybride, taux absent, nul ou négatif → refus.
 */
export function computeAgreementFee(
  netTnd: number,
  rule: ResolvedAgreementRule,
): { amount: number; basis: string } {
  const p = rule.percentValue
  if (rule.type !== "percent") {
    throw new AgreementFeeError(
      "AGREEMENT_RULE_INVALID",
      `ligne ${rule.ruleId} (${rule.type}) : seul un pourcentage du prix net fournisseur est autorisé pour un accord Network.`,
    )
  }
  if (p === null || !Number.isFinite(p) || p <= 0 || rule.fixedValue !== null) {
    throw new AgreementFeeError(
      "AGREEMENT_RULE_INVALID",
      `ligne ${rule.ruleId} : taux absent, nul ou négatif, ou montant fixe renseigné — le taux doit être décidé par la Direction.`,
    )
  }
  return {
    amount: round2((netTnd * p) / 100),
    basis: `frais Easy2Book accord ${rule.agreementId} (net fournisseur × ${p}%)`,
  }
}
