/**
 * Pricing pur — calcul du sous-total, TVA, frais de service, total TTC,
 * acompte et solde. Pas d'I/O, pas d'effets de bord ⇒ testable à 100 %.
 *
 * Convention : tous les montants sont stockés en TND (devise comptable
 * tunisienne) avec 2 décimales. Si la devise affichée au client diffère,
 * on convertit dans la couche au-dessus (UI / Server Action).
 */

export type RatePayload = {
  /** Prix unitaire HT par occupant (adulte). Doit être ≥ 0. */
  unitPriceTnd: number
  /** Nombre d'adultes. ≥ 1. */
  adults: number
  /** Nombre d'enfants. ≥ 0. */
  children?: number
  /** Tarif enfant (≥ 0). Si absent, on considère 50 % de l'adulte. */
  unitChildPriceTnd?: number
  /** Taux de TVA en pourcentage (ex. 19 pour 19 %). Défaut 19. */
  vatRate?: number
  /** Frais de service fixes (TND). Défaut 0. */
  serviceFeeTnd?: number
  /** Pourcentage d'acompte exigé à la réservation. Défaut 30. */
  depositPercent?: number
}

export type PriceBreakdown = {
  subtotalTnd: number
  vatTnd: number
  serviceFeeTnd: number
  totalTnd: number
  depositTnd: number
  balanceTnd: number
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Calcule le breakdown complet pour une réservation.
 *
 * Règles métier :
 *  - sous-total HT = adultes × prixAdulte + enfants × prixEnfant
 *  - prix enfant : par défaut 50 % du prix adulte si non fourni
 *  - TVA = sous-total × tauxTVA
 *  - frais de service ne sont pas taxés
 *  - total TTC = sous-total + TVA + frais
 *  - acompte = total × depositPercent / 100
 *  - solde = total − acompte (≥ 0)
 *
 * Throws si une valeur d'entrée est invalide (NaN, négative, etc.).
 */
export function computePriceBreakdown(input: RatePayload): PriceBreakdown {
  const {
    unitPriceTnd,
    adults,
    children = 0,
    unitChildPriceTnd,
    vatRate = 19,
    serviceFeeTnd = 0,
    depositPercent = 30,
  } = input

  if (!Number.isFinite(unitPriceTnd) || unitPriceTnd < 0) {
    throw new Error("unitPriceTnd must be a finite non-negative number")
  }
  if (!Number.isInteger(adults) || adults < 1) {
    throw new Error("adults must be an integer >= 1")
  }
  if (!Number.isInteger(children) || children < 0) {
    throw new Error("children must be an integer >= 0")
  }
  if (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100) {
    throw new Error("vatRate must be between 0 and 100")
  }
  if (!Number.isFinite(serviceFeeTnd) || serviceFeeTnd < 0) {
    throw new Error("serviceFeeTnd must be >= 0")
  }
  if (
    !Number.isFinite(depositPercent) ||
    depositPercent < 0 ||
    depositPercent > 100
  ) {
    throw new Error("depositPercent must be between 0 and 100")
  }

  const childPrice =
    unitChildPriceTnd !== undefined ? unitChildPriceTnd : unitPriceTnd * 0.5
  if (!Number.isFinite(childPrice) || childPrice < 0) {
    throw new Error("unitChildPriceTnd must be >= 0")
  }

  const subtotalTnd = round2(adults * unitPriceTnd + children * childPrice)
  const vatTnd = round2((subtotalTnd * vatRate) / 100)
  const totalTnd = round2(subtotalTnd + vatTnd + serviceFeeTnd)
  const depositTnd = round2((totalTnd * depositPercent) / 100)
  const balanceTnd = round2(totalTnd - depositTnd)

  return {
    subtotalTnd,
    vatTnd,
    serviceFeeTnd: round2(serviceFeeTnd),
    totalTnd,
    depositTnd,
    balanceTnd,
  }
}

/**
 * Convertit un montant TND vers une autre devise (au taux fourni).
 * Si `rate` est <= 0 ou non fini, renvoie le montant TND original.
 */
export function convertFromTnd(amountTnd: number, rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0) return amountTnd
  return round2(amountTnd / rate)
}

/**
 * Détecte un écart de prix matériel entre un montant ATTENDU (affiché au
 * client avant confirmation — snapshot pris au moment de l'ajout au panier)
 * et le montant réellement recalculé côté serveur juste avant la charge
 * (CART-DRIFT-01). Tolérance = arrondi flottant uniquement (1 centime,
 * jamais un pourcentage) : tout écart réel de prix (repricing fournisseur,
 * marge, tarif) doit être détecté et bloquer la charge silencieuse.
 * `expectedTnd` absent (chemin non-panier, ex. checkout individuel qui a
 * déjà revérifié via price-token.ts) ⇒ jamais de faux positif, `false`.
 */
export function priceDrifted(
  expectedTnd: number | undefined | null,
  actualTnd: number,
  toleranceTnd = 0.01,
): boolean {
  if (expectedTnd == null || !Number.isFinite(expectedTnd)) return false
  return Math.abs(actualTnd - expectedTnd) > toleranceTnd
}

/**
 * Format français : 1 234,50 TND
 */
export function formatMoney(amount: number, currency = "TND"): string {
  if (!Number.isFinite(amount)) return `0 ${currency}`
  return `${amount.toLocaleString("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} ${currency}`
}

// ---------------------------------------------------------------------------
// Snapshot fiscal — figé au moment de la réservation, jamais recalculé.
// ---------------------------------------------------------------------------

export type FiscalStatus = "determined" | "exempt" | "out_of_scope" | "pending"

export type FiscalSnapshot = {
  status: FiscalStatus
  country: string | null
  serviceCategory: string | null
  vatRate: number | null
  taxBasis: "HT" | "TTC" | null
  subtotalTnd: number | null
  vatTnd: number | null
  totalTnd: number
  rounding: "round2"
  taxRuleRef: string | null
  capturedAt: string
  fiscalNote: string | null
  fiscal_rule_id: string | null
  fiscal_rule_version: number | null
  // LOT 7 — taxe fixe par unité (taxe de séjour, taxe de location…)
  // Informationnelle : collectée hors Easy2Book (ex: à la réception de l'hôtel).
  unitTaxTnd: number | null   // total taxe fixe en TND (unitRate × unitCount)
  unitCount: number | null    // unités effectivement taxées (plafonnées par maxUnits)
  unitRate: number | null     // montant par unité en TND
}

/** Snapshot à partir d'un PriceBreakdown (base HT connue). */
export function buildFiscalSnapshot(
  breakdown: PriceBreakdown,
  vatRate: number,
  serviceCategory: string,
  taxRuleRef: string | null,
  fiscalNote: string | null = null,
  fiscalRuleId: string | null = null,
  fiscalRuleVersion: number | null = null,
): FiscalSnapshot {
  return {
    status: "determined",
    country: "TN",
    serviceCategory,
    vatRate,
    taxBasis: "HT",
    subtotalTnd: breakdown.subtotalTnd,
    vatTnd: breakdown.vatTnd,
    totalTnd: breakdown.totalTnd,
    rounding: "round2",
    taxRuleRef,
    capturedAt: new Date().toISOString(),
    fiscalNote,
    fiscal_rule_id: fiscalRuleId,
    fiscal_rule_version: fiscalRuleVersion,
    unitTaxTnd: null,
    unitCount: null,
    unitRate: null,
  }
}

/**
 * Snapshot à partir d'un TTC connu (promo B2C — HT/TVA déduits).
 * Garantit que subtotalTnd + vatTnd === totalTnd (arrondi centimes).
 */
export function buildFiscalSnapshotFromTtc(
  totalTnd: number,
  vatRate: number,
  serviceCategory: string,
  taxRuleRef: string | null,
  fiscalNote: string | null = null,
  fiscalRuleId: string | null = null,
  fiscalRuleVersion: number | null = null,
): FiscalSnapshot {
  const subtotalTnd = round2(totalTnd / (1 + vatRate / 100))
  const vatTnd = round2(totalTnd - subtotalTnd)
  return {
    status: "determined",
    country: "TN",
    serviceCategory,
    vatRate,
    taxBasis: "TTC",
    subtotalTnd,
    vatTnd,
    totalTnd,
    rounding: "round2",
    taxRuleRef,
    capturedAt: new Date().toISOString(),
    fiscalNote,
    fiscal_rule_id: fiscalRuleId,
    fiscal_rule_version: fiscalRuleVersion,
    unitTaxTnd: null,
    unitCount: null,
    unitRate: null,
  }
}

/** Snapshot en attente — voitures, transferts, vols (taux non encore déterminé). */
export function buildPendingFiscalSnapshot(
  totalTnd: number,
  serviceCategory: string,
  fiscalNote: string,
): FiscalSnapshot {
  return {
    status: "pending",
    country: "TN",
    serviceCategory,
    vatRate: null,
    taxBasis: null,
    subtotalTnd: null,
    vatTnd: null,
    totalTnd,
    rounding: "round2",
    taxRuleRef: null,
    capturedAt: new Date().toISOString(),
    fiscalNote,
    fiscal_rule_id: null,
    fiscal_rule_version: null,
    unitTaxTnd: null,
    unitCount: null,
    unitRate: null,
  }
}

/**
 * Snapshot avec taxe fixe par unité (LOT 7).
 *
 * Utilisé pour les modules où s'applique une taxe à montant fixe par unité
 * (ex : taxe de séjour LF 2024 Art. 46 — 4/8/12 TND/nuit/personne).
 *
 * La TVA Easy2Book est calculée sur totalTnd (base TTC).
 * La taxe unitaire est INFORMATIONNELLE : collectée hors Easy2Book
 * (ex: à la réception de l'hôtel — non incluse dans le paiement Easy2Book).
 *
 * @param unitAmount  Montant par unité en TND (ex: 8 pour hôtel 3★ étrangers).
 * @param unitCount   Nombre d'unités brutes (ex: nuits × personnes).
 * @param maxUnits    Plafond d'unités taxées (ex: 10 — LF 2024 Art. 46). null = pas de plafond.
 */
export function buildFiscalSnapshotWithUnitTax(
  totalTnd: number,
  vatRate: number,
  serviceCategory: string,
  taxRuleRef: string | null,
  fiscalNote: string | null = null,
  fiscalRuleId: string | null = null,
  fiscalRuleVersion: number | null = null,
  unitAmount: number,
  unitCount: number,
  maxUnits: number | null = null,
): FiscalSnapshot {
  const effectiveCount =
    maxUnits !== null ? Math.min(unitCount, maxUnits) : unitCount
  const unitTaxTnd = round2(unitAmount * effectiveCount)
  const subtotalTnd = round2(totalTnd / (1 + vatRate / 100))
  const vatTnd = round2(totalTnd - subtotalTnd)
  return {
    status: "determined",
    country: "TN",
    serviceCategory,
    vatRate,
    taxBasis: "TTC",
    subtotalTnd,
    vatTnd,
    totalTnd,
    rounding: "round2",
    taxRuleRef,
    capturedAt: new Date().toISOString(),
    fiscalNote,
    fiscal_rule_id: fiscalRuleId,
    fiscal_rule_version: fiscalRuleVersion,
    unitTaxTnd,
    unitCount: effectiveCount,
    unitRate: unitAmount,
  }
}
