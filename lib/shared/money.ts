/**
 * Chantier 62 — Contrat monétaire commun.
 *
 * Constat Chantier 61 : 8 modules utilisent 3 fonctions d'arrondi distinctes
 * (round2, roundTnd, Math.round), stockées dans 3 fichiers privés, avec une
 * asymétrie documentée :
 *   - DB : decimal(14, 2) → 2 décimales max
 *   - reservations.tndAmount : String(n) — non normalisé à 2 décimales
 *   - payments.tndAmount     : n.toFixed(2) — normalisé
 *
 * Ce module définit :
 *   - Les fonctions d'arrondi canoniques, avec leur portée documentée.
 *   - Le type `TndMoney` pour les calculs internes haute précision.
 *   - L'interface `PricingResult` — contrat de sortie de tous les moteurs
 *     de tarification. Les moteurs existants (computePriceBreakdown,
 *     calculateTransferPrice, calculateCarPrice) peuvent continuer à opérer
 *     en interne; leurs appelants adaptent la sortie vers `PricingResult`.
 *
 * INVARIANTS garantis par ce module :
 *   - toPersisted(n) retourne exactement ".toFixed(2)" — ce que décimal(14,2)
 *     attend, sans surprise de troncature Postgres.
 *   - round2 et roundTnd ne perdent jamais plus de 0.005 TND vs la valeur
 *     mathématique exacte.
 */

// ---------------------------------------------------------------------------
// Arrondi canonique
// ---------------------------------------------------------------------------

/** 2 décimales — à utiliser avant tout INSERT en decimal(14,2). */
export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** 3 décimales — précision interne (marges, prix moteur transfert/voiture). */
export function roundTnd(n: number): number {
  return Math.round(n * 1000) / 1000
}

/**
 * Convertit une valeur numérique en chaîne stockable dans decimal(14,2).
 * Remplace `String(n)` (qui peut produire "15.125") par `n.toFixed(2)`
 * (produit toujours "15.13"), aligné avec ce que Postgres va stocker.
 */
export function toPersisted(n: number): string {
  return n.toFixed(2)
}

// ---------------------------------------------------------------------------
// Type interne haute précision
// ---------------------------------------------------------------------------

/**
 * Représentation monétaire interne pour calculs sans perte d'entier.
 * `amount` en millièmes de TND (scale 3) stocké comme entier bigint.
 * Exemple : 15.125 TND → { amount: 15125n, currency: "TND", scale: 3 }
 *
 * Usage : calculs intermédiaires où la troncature float serait significative.
 * Pas obligatoire pour tous les modules — les moteurs actuels restent valides.
 */
export interface TndMoney {
  amount: bigint
  currency: "TND"
  scale: 3
}

/** Constructeurs et helpers pour TndMoney. */
export const TND = {
  /** Crée un TndMoney depuis un number (arrondi à scale 3). */
  from(n: number): TndMoney {
    return { amount: BigInt(Math.round(n * 1000)), currency: "TND", scale: 3 }
  },

  /** Addition sans erreur d'arrondi float. */
  add(a: TndMoney, b: TndMoney): TndMoney {
    return { amount: a.amount + b.amount, currency: "TND", scale: 3 }
  },

  /** Multiplication par un pourcentage entier (ex. 10 pour 10 %). */
  pct(a: TndMoney, pct: number): TndMoney {
    // Utilise round half-up au millième
    return { amount: BigInt(Math.round(Number(a.amount) * pct / 100)), currency: "TND", scale: 3 }
  },

  /** Retourne la valeur en number (3 décimales). */
  toNumber(a: TndMoney): number {
    return Number(a.amount) / 1000
  },

  /** Retourne la chaîne persistable en decimal(14,2). */
  toPersisted(a: TndMoney): string {
    return TND.toNumber(a).toFixed(2)
  },
} as const

// ---------------------------------------------------------------------------
// Contrat de sortie des moteurs de tarification — PricingResult
// ---------------------------------------------------------------------------

/**
 * Interface commune retournée (ou adaptée) par tous les moteurs de prix.
 *
 * Garanties :
 *   - Tous les montants sont en TND, arrondis à 2 décimales (round2).
 *   - `total` = subtotal + fees + taxes (jamais recalculé par les appelants).
 *   - `deposit` et `balance` sont optionnels (modules sans acompte).
 *   - `margin` et `commission` sont absents pour les modules sans marge B2B
 *     (omra, packages, activités, voitures — prix catalogue direct).
 *   - `source` identifie le moteur (traçabilité audit).
 *   - `ruleVersion` identifie la version de la règle tarifaire appliquée
 *     (snapshotting — un changement futur n'altère pas les réservations passées).
 */
export interface PricingResult {
  /** Sous-total HT. */
  subtotal: number
  /** Frais de service (0 si aucun). */
  fees: number
  /** Taxes (TVA, etc.) — 0 si exclues du prix net fournisseur. */
  taxes: number
  /** Total TTC = subtotal + fees + taxes. */
  total: number
  /** Acompte à la réservation (absent si non applicable). */
  deposit?: number
  /** Solde restant dû (absent si non applicable). */
  balance?: number
  /**
   * Marge agence ajoutée au prix net fournisseur.
   * Absent pour les modules où l'agence fixe directement le prix catalogue.
   */
  margin?: {
    net: number          // prix fournisseur HT
    sale: number         // prix après marge (= total ici)
    delta: number        // sale - net
    ruleId?: string      // margin_rules.id (System B)
    type: "percent" | "fixed"
    value: number
  }
  /** Commission Easy2Book sur la marge (absent si 0 ou module sans marge). */
  commission?: {
    amount: number
    rate: number         // en %
  }
  /** Identifiant du moteur de tarification (traçabilité). */
  source: string
  /**
   * Version de la règle tarifaire (snapshot figé à la réservation).
   * Chaîne libre : "catalog-v1", "margin-rule-42", etc.
   */
  ruleVersion: string
}
