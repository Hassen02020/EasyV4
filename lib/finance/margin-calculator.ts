/**
 * Margin Calculator - Easy2Book V6
 *
 * Service de calcul automatique des marges selon les règles configurées
 * Applique la règle la plus prioritaire (fournisseur > produit > global)
 */

import type { MarginRule } from "@/lib/db/schema"
import { marginType } from "@/lib/db/schema"

/**
 * Contexte de calcul de marge
 */
export interface MarginCalculationContext {
  agencyId: string
  supplierId?: string
  productType?: string // hotel, flight, package, transfer, omra
  destination?: string // Code pays (TN, FR, MA...)
  supplierPrice: number // Prix achat fournisseur
  supplierCurrency: string
  exchangeRate?: number // Taux de change vers TND
}

/**
 * Résultat du calcul de marge
 */
export interface MarginCalculationResult {
  marginRuleId?: string
  marginRuleName?: string
  
  // Prix achat
  supplierPrice: number
  supplierCurrency: string
  supplierPriceTnd: number // Converti en TND
  
  // Prix vente calculé
  salePriceTnd: number
  salePriceOriginal: number // Dans la devise originale
  
  // Marge
  marginAmount: number // En TND
  marginPercent: number // % du prix achat
  
  // Commission Easy2Book
  commissionAmount: number
  commissionPercent: number
  
  // Règle appliquée
  ruleType: "percent" | "fixed" | "hybrid"
  ruleValue?: {
    percent?: number
    fixed?: number
  }
}

/**
 * Trouve la règle de marge applicable (la plus prioritaire)
 */
export function findApplicableMarginRule(
  rules: MarginRule[],
  context: MarginCalculationContext
): MarginRule | null {
  // Filtrer les règles actives et valides
  const now = new Date()
  const activeRules = rules.filter(
    (rule) =>
      rule.isActive &&
      (!rule.validFrom || new Date(rule.validFrom) <= now) &&
      (!rule.validTo || new Date(rule.validTo) >= now)
  )

  // Score de correspondance (plus élevé = plus spécifique)
  const scoredRules = activeRules.map((rule) => {
    let score = 0

    // Correspondance agence (obligatoire)
    if (rule.agencyId === context.agencyId) {
      score += 10
    }

    // Correspondance fournisseur (très spécifique)
    if (rule.supplierId && context.supplierId && rule.supplierId === context.supplierId) {
      score += 50
    }

    // Correspondance type produit
    if (rule.productType && context.productType && rule.productType === context.productType) {
      score += 20
    }

    // Correspondance destination
    if (rule.destination && context.destination && rule.destination === context.destination) {
      score += 15
    }

    // Vérification des contraintes de prix
    if (rule.minPrice && context.supplierPrice < Number(rule.minPrice)) {
      score = 0 // Règle non applicable
    }
    if (rule.maxPrice && context.supplierPrice > Number(rule.maxPrice)) {
      score = 0 // Règle non applicable
    }

    return { rule, score }
  })

  // Filtrer les règles applicables (score > 10 minimum)
  const applicableRules = scoredRules.filter((r) => r.score > 10)

  if (applicableRules.length === 0) {
    return null
  }

  // Trier par score puis par priorité
  applicableRules.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score
    return b.rule.priority - a.rule.priority
  })

  return applicableRules[0].rule
}

/**
 * Calcule la marge selon une règle
 */
export function calculateMargin(
  context: MarginCalculationContext,
  rule: MarginRule | null
): MarginCalculationResult {
  const exchangeRate = context.exchangeRate || 1
  const supplierPriceTnd = context.supplierPrice * exchangeRate

  let marginAmount = 0
  let marginPercent = 0
  let salePriceTnd = supplierPriceTnd
  let ruleType: "percent" | "fixed" | "hybrid" = "percent"

  if (rule) {
    const percentValue = rule.percentValue ? Number(rule.percentValue) : 0
    const fixedValue = rule.fixedValue ? Number(rule.fixedValue) : 0

    switch (rule.type) {
      case "percent":
        marginAmount = supplierPriceTnd * (percentValue / 100)
        marginPercent = percentValue
        salePriceTnd = supplierPriceTnd + marginAmount
        ruleType = "percent"
        break

      case "fixed":
        marginAmount = fixedValue
        marginPercent = (fixedValue / supplierPriceTnd) * 100
        salePriceTnd = supplierPriceTnd + marginAmount
        ruleType = "fixed"
        break

      case "hybrid":
        marginAmount = supplierPriceTnd * (percentValue / 100) + fixedValue
        marginPercent = (marginAmount / supplierPriceTnd) * 100
        salePriceTnd = supplierPriceTnd + marginAmount
        ruleType = "hybrid"
        break
    }
  } else {
    // Règle par défaut : 10% de marge
    marginAmount = supplierPriceTnd * 0.1
    marginPercent = 10
    salePriceTnd = supplierPriceTnd + marginAmount
  }

  // Calcul de la commission Easy2Book
  const commissionPercent = rule?.commissionPercent ? Number(rule.commissionPercent) : 0
  const commissionAmount = marginAmount * (commissionPercent / 100)

  // Prix de vente dans la devise originale
  const salePriceOriginal = salePriceTnd / exchangeRate

  return {
    marginRuleId: rule?.id,
    marginRuleName: rule?.name,
    supplierPrice: context.supplierPrice,
    supplierCurrency: context.supplierCurrency,
    supplierPriceTnd,
    salePriceTnd,
    salePriceOriginal,
    marginAmount,
    marginPercent,
    commissionAmount,
    commissionPercent,
    ruleType,
    ruleValue: rule
      ? {
          percent: rule.percentValue ? Number(rule.percentValue) : undefined,
          fixed: rule.fixedValue ? Number(rule.fixedValue) : undefined,
        }
      : undefined,
  }
}

/**
 * Calcule la marge avec sélection automatique de la règle
 */
export function calculateMarginWithRuleSelection(
  rules: MarginRule[],
  context: MarginCalculationContext
): MarginCalculationResult {
  const applicableRule = findApplicableMarginRule(rules, context)
  return calculateMargin(context, applicableRule)
}

/**
 * Valide un calcul de marge
 */
export function validateMarginCalculation(
  result: MarginCalculationResult
): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (result.salePriceTnd <= result.supplierPriceTnd) {
    errors.push("Le prix de vente doit être supérieur au prix achat")
  }

  if (result.marginPercent < 0) {
    errors.push("La marge ne peut pas être négative")
  }

  if (result.marginPercent > 100) {
    errors.push("La marge ne peut pas dépasser 100%")
  }

  if (result.commissionAmount > result.marginAmount) {
    errors.push("La commission ne peut pas dépasser la marge")
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Génère un résumé textuel du calcul
 */
export function generateMarginSummary(result: MarginCalculationResult): string {
  const ruleName = result.marginRuleName || "Règle par défaut (10%)"
  const ruleTypeLabel =
    result.ruleType === "percent"
      ? "Pourcentage"
      : result.ruleType === "fixed"
      ? "Montant fixe"
      : "Hybride"

  return `${ruleName} (${ruleTypeLabel}): ${result.supplierPriceTnd.toFixed(2)} TND + ${result.marginAmount.toFixed(2)} TND (${result.marginPercent.toFixed(1)}%) = ${result.salePriceTnd.toFixed(2)} TND`
}
