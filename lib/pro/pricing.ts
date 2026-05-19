/**
 * Moteur de marge B2B (Phase 9).
 *
 * Lit la table `pricing_margins` pour l'agence partenaire courante et
 * applique la marge appropriée à chaque prix net affiché dans le tunnel
 * Pro. Si aucune marge active n'est trouvée (ou si la BDD n'est pas
 * accessible côté preview), on revient sur un jeu par défaut afin que
 * les pages restent affichables.
 *
 * Architecture :
 *  - `MarginMap` est un dict { module → MarginRule } passé aux composants
 *    client (SERP, détail hôtel, tunnel).
 *  - `applyMargin(net, rule)` retourne le prix client TND TTC.
 *  - `getMarginsForAgency(agencyId)` interroge Drizzle si possible et
 *    retourne la `MarginMap` complète (avec fallback par défaut sur les
 *    modules manquants).
 */

export type MarginModule =
  | "hotel"
  | "flight"
  | "omra"
  | "package"
  | "activity"
  | "transfer"

export type MarginRule = {
  marginType: "percent" | "fixed"
  marginValue: number
  isActive: boolean
}

export type MarginMap = Record<MarginModule, MarginRule>

/**
 * Marges affichées par défaut quand l'agence partenaire n'a rien
 * configuré OU quand la BDD n'est pas disponible (preview Vercel sans
 * `DATABASE_URL`). Volontairement conservatrices.
 */
export const DEFAULT_MARGINS: MarginMap = {
  hotel: { marginType: "percent", marginValue: 10, isActive: true },
  flight: { marginType: "fixed", marginValue: 25, isActive: true },
  omra: { marginType: "percent", marginValue: 8, isActive: true },
  package: { marginType: "percent", marginValue: 12, isActive: true },
  activity: { marginType: "percent", marginValue: 15, isActive: true },
  transfer: { marginType: "fixed", marginValue: 10, isActive: true },
}

/**
 * Calcule le prix client final à partir du prix net et d'une règle.
 * - `percent` : prix × (1 + value / 100)
 * - `fixed` : prix + value (TND par chambre / par offre)
 *
 * Si la règle est inactive, retourne le prix net inchangé.
 */
export function applyMargin(net: number, rule: MarginRule): number {
  if (!rule.isActive) return net
  if (rule.marginType === "percent") {
    return Math.round(net * (1 + rule.marginValue / 100) * 1000) / 1000
  }
  return Math.round((net + rule.marginValue) * 1000) / 1000
}

/**
 * Helper : retourne le markup en TND ajouté par la marge pour un prix
 * donné. Pratique pour afficher "+ X DT marge agence" dans les
 * récapitulatifs internes.
 */
export function marginDelta(net: number, rule: MarginRule): number {
  return applyMargin(net, rule) - net
}

/**
 * Applique la marge `hotel` sur toutes les options de pension (boardings)
 * du fixture. Retourne un nouvel objet hôtel (immutabilité).
 */
export function applyMarginsToHotel<
  T extends { boardings: { type: string; price: number }[] },
>(hotel: T, margins: MarginMap): T {
  const rule = margins.hotel
  return {
    ...hotel,
    boardings: hotel.boardings.map((b) => ({
      ...b,
      price: applyMargin(b.price, rule),
    })),
  }
}

/**
 * Applique la marge `hotel` à un tableau d'offres chambre. On suppose
 * que les offres sont du module hôtel (séjour) — pas un mix.
 */
export function applyMarginsToOffers<T extends { price: number }>(
  offers: T[],
  margins: MarginMap,
): T[] {
  const rule = margins.hotel
  return offers.map((o) => ({
    ...o,
    price: applyMargin(o.price, rule),
  }))
}
