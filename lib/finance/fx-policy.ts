/**
 * CURRENCY-DIM-02 — Politique FX Trésorerie & Coût Bancaire.
 *
 * Deux notions distinctes :
 *  - Taux de référence : taux mid-market (exchangerate-api.com, CURRENCY-DIM-01)
 *  - Taux appliqué     : taux de référence + correction banque (spread)
 *  - Frais bancaire    : coût fixe ou % du virement bancaire
 *
 * La politique est versionnée : toute modification Super Admin crée une
 * nouvelle version. Un booking immutabilise `fx_policy_id` dans
 * `reservation_financials` — aucune rétro-activité.
 *
 * Fail-closed : `getActiveFxPolicy()` lève `FxPolicyUnavailableError` si
 * aucune politique active n'est trouvée — jamais de valeur par défaut
 * inventée (règle Direction 2026-10-01).
 *
 * Isolation devises : ce module n'est invoqué que si `supplierCurrency ≠
 * "TND"`. Si le fournisseur facture en TND, la fonction identité
 * (`fetchExchangeRateForBooking("TND","TND")`) court-circuite et ce module
 * n'est jamais appelé.
 */

import { getDb } from "@/lib/db/client"
import { fxPolicies } from "@/lib/db/schema/financials"
import { desc, lte } from "drizzle-orm"
import type { ExchangeRate } from "./exchange-rate"

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

export type CorrectionMode =
  | "NONE"
  | "PERCENTAGE"
  | "FIXED_SPREAD"
  | "FIXED_RATE"
export type BankFeeMode = "NONE" | "FIXED" | "PERCENTAGE" | "MIN_MAX"

export interface FxPolicy {
  id: string
  version: number
  effectiveFrom: Date
  effectiveTo: Date | null
  correctionMode: CorrectionMode
  correctionValue: number
  bankFeeMode: BankFeeMode
  bankFeeFixed: number | null
  bankFeePercent: number | null
  bankFeeMin: number | null
  bankFeeMax: number | null
  bankFeeCurrency: string
  note: string | null
  createdBy: string
  createdAt: Date
}

/**
 * Taux appliqué : taux de référence enrichi de la correction politique.
 * Champ `policyId` + `policyVersion` : immuabilité garantie par FK dans
 * `reservation_financials.fx_policy_id`.
 */
export interface AppliedRate {
  from: string
  to: string
  referenceRate: number
  appliedRate: number
  correctionApplied: number
  policyId: string
  policyVersion: number
  capturedAt: Date
}

/* -------------------------------------------------------------------------- */
/* Erreur fail-closed                                                          */
/* -------------------------------------------------------------------------- */

export class FxPolicyUnavailableError extends Error {
  constructor(public readonly reason: string) {
    super(
      `Politique FX indisponible (${reason}). ` +
        `Opération refusée — CURRENCY-DIM-02, règle Direction 2026-10-01.`,
    )
    this.name = "FxPolicyUnavailableError"
  }
}

/* -------------------------------------------------------------------------- */
/* Injection de test                                                            */
/* -------------------------------------------------------------------------- */

let _overridePolicy: FxPolicy | null = null

export function setFxPolicyOverride(policy: FxPolicy | null): void {
  _overridePolicy = policy
}

/* -------------------------------------------------------------------------- */
/* Résolution de la politique active                                            */
/* -------------------------------------------------------------------------- */

/**
 * Retourne la politique FX active au moment de l'appel.
 * "Active" = `effective_from <= now` ET (`effective_to IS NULL` OU `effective_to > now`).
 * Si plusieurs versions actives (chevauchement de dates), prend la plus récente.
 *
 * Fail-closed : lève `FxPolicyUnavailableError` si aucune politique n'est trouvée.
 */
export async function getActiveFxPolicy(): Promise<FxPolicy> {
  if (_overridePolicy) return _overridePolicy

  const now = new Date()
  const db = getDb()

  const rows = await db
    .select()
    .from(fxPolicies)
    .where(
      // effective_from <= now — effective_to IS NULL or > now filtered post-select
      lte(fxPolicies.effectiveFrom, now),
    )
    .orderBy(desc(fxPolicies.version))
    .limit(10)

  const active = rows.find(
    (r: typeof fxPolicies.$inferSelect) =>
      !r.effectiveTo || new Date(r.effectiveTo as unknown as string) > now,
  )

  if (!active) {
    throw new FxPolicyUnavailableError("aucune politique active en base")
  }

  return rowToPolicy(active)
}

function rowToPolicy(row: typeof fxPolicies.$inferSelect): FxPolicy {
  // eslint-disable-line
  return {
    id: row.id,
    version: row.version,
    effectiveFrom: new Date(row.effectiveFrom as unknown as string),
    effectiveTo: row.effectiveTo
      ? new Date(row.effectiveTo as unknown as string)
      : null,
    correctionMode: row.correctionMode as CorrectionMode,
    correctionValue: Number(row.correctionValue),
    bankFeeMode: row.bankFeeMode as BankFeeMode,
    bankFeeFixed: row.bankFeeFixed != null ? Number(row.bankFeeFixed) : null,
    bankFeePercent:
      row.bankFeePercent != null ? Number(row.bankFeePercent) : null,
    bankFeeMin: row.bankFeeMin != null ? Number(row.bankFeeMin) : null,
    bankFeeMax: row.bankFeeMax != null ? Number(row.bankFeeMax) : null,
    bankFeeCurrency: row.bankFeeCurrency,
    note: row.note ?? null,
    createdBy: row.createdBy,
    createdAt: new Date(row.createdAt as unknown as string),
  }
}

/* -------------------------------------------------------------------------- */
/* Calcul du taux appliqué                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Applique la correction de la politique FX au taux de référence.
 *
 * - NONE         : taux appliqué = taux référence (identité)
 * - PERCENTAGE   : taux appliqué = référence × (1 + correctionValue / 100)
 *                  (ex. banque prend 1.5% de spread → correctionValue = 1.5)
 * - FIXED_SPREAD : taux appliqué = référence + correctionValue
 *                  (ex. banque ajoute toujours +0.05 TND/USD → correctionValue = 0.05)
 * - FIXED_RATE   : taux appliqué = correctionValue (taux absolu, remplace la référence —
 *                  cas taux négocié contractuellement avec la banque)
 *
 * `applied_exchange_rate` représente le taux **économique Easy2Book** :
 * ce qu'Easy2Book supporte réellement pour convertir la devise fournisseur en TND,
 * après prise en compte du spread bancaire. Ce n'est pas le taux affiché à l'agence
 * ni un taux "bancaire réel" certifié — c'est l'estimation interne de coût.
 *
 * Arrondi à 6 décimales pour cohérence avec `exchange_rate decimal(10,6)`.
 */
export function applyFxCorrection(
  referenceRate: ExchangeRate,
  policy: FxPolicy,
): AppliedRate {
  let applied: number

  switch (policy.correctionMode) {
    case "NONE":
      applied = referenceRate.rate
      break
    case "PERCENTAGE":
      applied = referenceRate.rate * (1 + policy.correctionValue / 100)
      break
    case "FIXED_SPREAD":
      applied = referenceRate.rate + policy.correctionValue
      break
    case "FIXED_RATE":
      applied = policy.correctionValue
      break
  }

  const rounded = Math.round(applied * 1_000_000) / 1_000_000
  const correction =
    Math.round((rounded - referenceRate.rate) * 1_000_000) / 1_000_000

  return {
    from: referenceRate.from,
    to: referenceRate.to,
    referenceRate: referenceRate.rate,
    appliedRate: rounded,
    correctionApplied: correction,
    policyId: policy.id,
    policyVersion: policy.version,
    capturedAt: referenceRate.capturedAt,
  }
}

/* -------------------------------------------------------------------------- */
/* Calcul du frais bancaire                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Calcule l'estimation du frais bancaire en TND pour un booking donné.
 *
 * `transactionAmountForeign` : montant en devise étrangère (ex. USD) — montant
 *                              fournisseur avant conversion.
 * `appliedRate`              : taux appliqué (economic rate, pas le taux mid-market).
 *
 * Base des calculs PERCENTAGE/MIN_MAX : **montant TND converti**
 *   = transactionAmountForeign × appliedRate
 * Ce n'est pas le montant étranger brut, ni le montant du virement total
 * (qui peut couvrir plusieurs bookings). L'allocation réelle d'un virement
 * multi-bookings est hors périmètre de ce module (→ BANK-RECONCILE-01).
 *
 * ⚠️ Cette valeur est une **estimation proratisée** du coût bancaire par
 * booking — non un prélèvement réel. Elle alimente `economic_entitlements`
 * à titre informatif (coût absorbé par Easy2Book) ; elle ne modifie pas
 * `salePriceTnd` ni le montant facturé à l'agence.
 *
 * - NONE        : 0
 * - FIXED       : bankFeeFixed TND (par booking)
 * - PERCENTAGE  : montantTnd × (bankFeePercent / 100)
 * - MIN_MAX     : PERCENTAGE clampé entre bankFeeMin et bankFeeMax
 *
 * Retourne 0 si les valeurs requises sont absentes (defensive, jamais NaN).
 */
export function computeBankFeeContribution(
  transactionAmountForeign: number,
  appliedRate: number,
  policy: FxPolicy,
): number {
  switch (policy.bankFeeMode) {
    case "NONE":
      return 0

    case "FIXED":
      return policy.bankFeeFixed ?? 0

    case "PERCENTAGE": {
      const pct = policy.bankFeePercent ?? 0
      const amountTnd = transactionAmountForeign * appliedRate
      return Math.round(amountTnd * (pct / 100) * 100) / 100
    }

    case "MIN_MAX": {
      const pct = policy.bankFeePercent ?? 0
      const amountTnd = transactionAmountForeign * appliedRate
      const raw = Math.round(amountTnd * (pct / 100) * 100) / 100
      const min = policy.bankFeeMin ?? 0
      const max = policy.bankFeeMax ?? Infinity
      return Math.min(Math.max(raw, min), max)
    }
  }
}
