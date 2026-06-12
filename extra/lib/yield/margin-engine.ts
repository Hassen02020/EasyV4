/**
 * Moteur de Calcul de Marge (Yield Engine)
 *
 * Ce module implémente la logique financière de calcul des prix de vente
 * pour les différents modules de réservation (hôtels, vols, omra, etc.).
 *
 * Formule de base : Prix_Vente = Prix_Achat + Marge
 *
 * Fonctionnalités :
 *  - Calcul automatique du prix de vente avec marge configurable
 *  - Conversion automatique des devises vers TND (pivot comptable)
 *  - Gestion des marges par module et par agence
 *  - Arrondi à 3 décimales (spécificité Dinar Tunisien)
 *
 * Utilisation :
 *  import { calculateSellingPrice } from "@/lib/yield/margin-engine"
 *  const sellingPrice = await calculateSellingPrice(150.00, "agency-uuid", "hotel")
 */

import { getDb } from "@/lib/db/client"
import { eq, and } from "drizzle-orm"

/**
 * Taux de change fixes (à remplacer par une table exchange_rates en production)
 * Ces taux sont utilisés pour convertir les prix d'achat en TND.
 */
const EXCHANGE_RATES: Record<string, number> = {
  TND: 1.0,
  EUR: 3.3, // 1 EUR = 3.3 TND (approximatif)
  USD: 3.1, // 1 USD = 3.1 TND (approximatif)
}

/**
 * Règles de marge par défaut par module (en pourcentage)
 * Ces valeurs sont utilisées si aucune règle spécifique n'est trouvée en DB.
 */
const DEFAULT_MARGIN_RULES: Record<string, number> = {
  hotel: 15.0, // 15% de marge sur les hôtels
  flight: 10.0, // 10% de marge sur les vols
  package: 20.0, // 20% de marge sur les voyages organisés
  activity: 18.0, // 18% de marge sur les activités
  transfer: 12.0, // 12% de marge sur les transferts
  omra: 15.0, // 15% de marge sur les packages Omra
}

/**
 * Interface pour le résultat du calcul de prix
 */
export interface PriceCalculation {
  /** Prix d'achat original (dans la devise d'origine) */
  costPrice: number
  /** Devise d'origine */
  costCurrency: string
  /** Prix d'achat converti en TND */
  costPriceTnd: number
  /** Pourcentage de marge appliqué */
  marginPercentage: number
  /** Montant de la marge en TND */
  marginAmount: number
  /** Prix de vente final en TND (arrondi à 3 décimales) */
  sellingPriceTnd: number
}

/**
 * Convertit un montant d'une devise vers TND
 *
 * @param amount - Montant à convertir
 * @param fromCurrency - Devise source (EUR, USD, TND)
 * @returns Montant converti en TND, arrondi à 3 décimales
 */
export function convertToTnd(amount: number, fromCurrency: string): number {
  const rate = EXCHANGE_RATES[fromCurrency.toUpperCase()]
  if (!rate) {
    throw new Error(
      `Devise non supportée: ${fromCurrency}. Devises disponibles: ${Object.keys(EXCHANGE_RATES).join(", ")}`,
    )
  }
  return roundToThreeDecimals(amount * rate)
}

/**
 * Arrondit un nombre à 3 décimales (spécificité TND)
 *
 * @param value - Valeur à arrondir
 * @returns Valeur arrondie à 3 décimales
 */
export function roundToThreeDecimals(value: number): number {
  return Math.round(value * 1000) / 1000
}

/**
 * Récupère le pourcentage de marge configuré pour un module
 *
 * Cette fonction interroge la table module_configs pour obtenir la marge
 * configurée par le Super Admin. Si aucune configuration n'existe,
 * elle retourne la marge par défaut du module.
 *
 * @param moduleType - Type de module (hotel, flight, etc.)
 * @returns Pourcentage de marge (ex: 15.0 pour 15%)
 */
export async function getMarginPercentage(moduleType: string): Promise<number> {
  try {
    const db = getDb()
    const { moduleConfigs } = await import("@/lib/db/schema")

    const [config] = await db
      .select({ marginPercentage: moduleConfigs.marginPercentage })
      .from(moduleConfigs)
      .where(eq(moduleConfigs.moduleType, moduleType as any))
      .limit(1)

    if (config && config.marginPercentage) {
      return parseFloat(config.marginPercentage)
    }

    // Si aucune configuration n'existe, retourner la marge par défaut
    return DEFAULT_MARGIN_RULES[moduleType] || 15.0
  } catch (error) {
    console.error("Erreur lors de la récupération de la marge:", error)
    return DEFAULT_MARGIN_RULES[moduleType] || 15.0
  }
}

/**
 * Calcule le prix de vente avec marge
 *
 * Cette fonction applique la formule financière :
 * Prix_Vente = Prix_Achat + Marge
 *
 * Où Marge = Prix_Achat × (Pourcentage_Marge / 100)
 *
 * Le prix d'achat est automatiquement converti en TND si nécessaire,
 * et le résultat est arrondi à 3 décimales.
 *
 * @param costPrice - Prix d'achat (coût fournisseur)
 * @param costCurrency - Devise du prix d'achat (EUR, USD, TND)
 * @param moduleType - Type de module (hotel, flight, package, etc.)
 * @param agencyId - ID de l'agence (optionnel, pour marges spécifiques)
 * @returns Objet PriceCalculation avec tous les détails du calcul
 *
 * @example
 * const result = await calculateSellingPrice(150.00, "EUR", "hotel")
 * console.log(result.sellingPriceTnd) // 574.125 TND
 * // Calcul: 150 EUR × 3.3 = 495 TND
 * //         495 TND × 1.15 (marge 15%) = 569.25 TND
 */
export async function calculateSellingPrice(
  costPrice: number,
  costCurrency: string,
  moduleType: string,
  agencyId?: string,
): Promise<PriceCalculation> {
  // 1. Convertir le prix d'achat en TND
  const costPriceTnd = convertToTnd(costPrice, costCurrency)

  // 2. Récupérer le pourcentage de marge configuré
  const marginPercentage = await getMarginPercentage(moduleType)

  // 3. Calculer le montant de la marge
  const marginAmount = roundToThreeDecimals(costPriceTnd * (marginPercentage / 100))

  // 4. Calculer le prix de vente final
  const sellingPriceTnd = roundToThreeDecimals(costPriceTnd + marginAmount)

  return {
    costPrice,
    costCurrency,
    costPriceTnd,
    marginPercentage,
    marginAmount,
    sellingPriceTnd,
  }
}

/**
 * Calcule le prix de vente pour plusieurs items (batch)
 *
 * Utile pour calculer le prix total d'une réservation avec plusieurs chambres,
 * vols, ou services.
 *
 * @param items - Tableau d'items avec prix et devise
 * @param moduleType - Type de module
 * @param agencyId - ID de l'agence (optionnel)
 * @returns Prix de vente total en TND
 */
export async function calculateBatchSellingPrice(
  items: Array<{ costPrice: number; costCurrency: string }>,
  moduleType: string,
  agencyId?: string,
): Promise<number> {
  let totalSellingPrice = 0

  for (const item of items) {
    const result = await calculateSellingPrice(
      item.costPrice,
      item.costCurrency,
      moduleType,
      agencyId,
    )
    totalSellingPrice += result.sellingPriceTnd
  }

  return roundToThreeDecimals(totalSellingPrice)
}

/**
 * Calcule le prix de vente inverse (à partir du prix de vente souhaité)
 *
 * Utile pour déterminer le prix d'achat maximum acceptable
 * pour atteindre un prix de vente cible.
 *
 * Formule inverse : Prix_Achat = Prix_Vente / (1 + Marge%)
 *
 * @param targetSellingPrice - Prix de vente cible en TND
 * @param moduleType - Type de module
 * @returns Prix d'achat maximum en TND
 */
export async function calculateReverseCostPrice(
  targetSellingPrice: number,
  moduleType: string,
): Promise<number> {
  const marginPercentage = await getMarginPercentage(moduleType)
  const costPrice = targetSellingPrice / (1 + marginPercentage / 100)
  return roundToThreeDecimals(costPrice)
}
