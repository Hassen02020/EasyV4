/**
 * Yield Math — fonctions de calcul de marge PURES (sans I/O, sans "use server").
 *
 * Ce fichier peut être importé côté client (previews de prix instantanés)
 * ET côté serveur, contrairement à engine.ts qui contient "use server".
 *
 * Formules :
 *  - percent  : prix_vente = prix_net × (1 + marge/100)
 *  - fixed    : prix_vente = prix_net + marge_fixe
 *  - combined : prix_vente = prix_net × (1 + pct/100) + fixe
 */

export type YieldModule =
  | "hotel"
  | "flight"
  | "omra"
  | "package"
  | "activity"
  | "transfer"
  | "car"

export type YieldRuleType = "percent" | "fixed" | "combined"

export type YieldRule = {
  id: string
  agencyId: string
  module: YieldModule
  ruleType: YieldRuleType
  percentValue: number
  fixedValueTnd: number
  minPriceTnd: number
  isActive: boolean
}

export type YieldRuleMap = Record<YieldModule, YieldRule>

export const ALL_YIELD_MODULES: YieldModule[] = [
  "hotel",
  "flight",
  "omra",
  "package",
  "activity",
  "transfer",
  "car",
]

export const DEFAULT_PERCENT: Record<YieldModule, number> = {
  hotel: 10,
  flight: 8,
  omra: 8,
  package: 12,
  activity: 15,
  transfer: 10,
  car: 10,
}

export function defaultRule(agencyId: string, module: YieldModule): YieldRule {
  return {
    id: `default-${module}`,
    agencyId,
    module,
    ruleType: "percent",
    percentValue: DEFAULT_PERCENT[module],
    fixedValueTnd: 0,
    minPriceTnd: 0,
    isActive: true,
  }
}

/**
 * Applique une règle de marge à un prix net.
 * Retourne le prix de vente TND arrondi au millime.
 */
export function applyYield(net: number, rule: YieldRule): number {
  if (!rule.isActive) return net
  if (!Number.isFinite(net) || net < 0) return net

  let price = net

  if (rule.ruleType === "percent" || rule.ruleType === "combined") {
    price = price * (1 + rule.percentValue / 100)
  }
  if (rule.ruleType === "fixed" || rule.ruleType === "combined") {
    price = price + rule.fixedValueTnd
  }

  price = Math.round(price * 1000) / 1000

  if (rule.minPriceTnd > 0 && price < rule.minPriceTnd) {
    return rule.minPriceTnd
  }

  return price
}

/**
 * Retourne la marge ajoutée en TND (pour affichage back-office).
 */
export function yieldDelta(net: number, rule: YieldRule): number {
  return Math.round((applyYield(net, rule) - net) * 1000) / 1000
}

/**
 * Applique la marge d'un module sur un tableau d'offres { price: number }.
 */
export function applyYieldToOffers<T extends { price: number }>(
  offers: T[],
  rules: YieldRuleMap,
  module: YieldModule,
): T[] {
  const rule = rules[module]
  return offers.map((o) => ({ ...o, price: applyYield(o.price, rule) }))
}
