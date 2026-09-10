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

/**
 * omra/package/activity/car délibérément EXCLUS : ces modules n'ont pas de
 * coût net séparé du prix de vente — l'agence fixe directement le prix
 * payé par le client au niveau du catalogue produit (`overridePrice`/
 * `basePrice` dans omra_allotments/omra_packages, même principe pour
 * Packages/Activités ; RLS `agency_id = current_agency_id()` confirme que
 * chaque agence ne voit/réserve que son propre catalogue, jamais un
 * modèle de revente grossiste). Appliquer une marge par-dessus gonflerait
 * silencieusement un prix déjà fixé par l'agence — jamais fait ici. Car
 * reste hors périmètre tant que le module n'est pas commercialisable
 * (voir EASYV4_CAR_DECISION.md — FEATURE_CAR=false, aucun catalogue).
 */
export type MarginModule = "hotel" | "flight" | "transfer"

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
 * Applique la marge `hotel` sur les prix des chambres du fixture.
 * Retourne un nouvel objet hôtel (immutabilité).
 */
export function applyMarginsToHotel<
  T extends { rooms: { prices: Record<string, number> }[] },
>(hotel: T, margins: MarginMap): T {
  const rule = margins.hotel
  return {
    ...hotel,
    rooms: hotel.rooms.map((r) => ({
      ...r,
      prices: Object.fromEntries(
        Object.entries(r.prices).map(([k, v]) => [k, applyMargin(v, rule)]),
      ),
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

/**
 * Applique la marge `hotel` à une offre myGo réelle (`HotelOfferDTO`,
 * `lib/mygo/types.ts`) — pour le portail B2B une fois branché sur le vrai
 * moteur de recherche (Phase 8), au lieu du fixture `ProHotel` ci-dessus.
 * Marque chaque prix de chambre (toutes pensions confondues) et `fromPrice`
 * avec la même règle, immuablement — jamais de mutation de l'offre myGo
 * d'origine.
 *
 * `fromPrice` est recalculé en appliquant la marge directement au
 * `fromPrice` net plutôt qu'en reprenant le minimum des chambres marginées
 * : `applyMargin` étant une transformation monotone (même règle sur toutes
 * les chambres), le résultat est strictement identique, sans dupliquer la
 * logique d'exclusion `stopReservation` déjà faite une fois à la source
 * (`lowestPrice`, `lib/mygo/mappers.ts`).
 */
export function applyMarginToHotelOffer<
  T extends {
    fromPrice: number
    boardings: {
      pax: { rooms: { price: number }[] }[]
    }[]
  },
>(offer: T, margins: MarginMap): T {
  const rule = margins.hotel
  return {
    ...offer,
    fromPrice: applyMargin(offer.fromPrice, rule),
    boardings: offer.boardings.map((b) => ({
      ...b,
      pax: b.pax.map((p) => ({
        ...p,
        rooms: p.rooms.map((r) => ({ ...r, price: applyMargin(r.price, rule) })),
      })),
    })),
  }
}
