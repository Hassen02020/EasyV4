/**
 * Conversion decimal TND ⇄ entier de millimes (chantier-49C, étape 1 —
 * expand/contract : ces helpers alimentent des colonnes `*Millimes`
 * ajoutées EN PARALLÈLE des colonnes `decimal` existantes, en double-
 * écriture. Aucun code de lecture ne dépend encore de ces colonnes —
 * uniquement une préparation pour une bascule future, une fois la
 * concordance validée en production (voir docs/CHANTIER_49C.md ou
 * npm run audit:financial).
 *
 * Le dinar tunisien a 3 décimales (1 millime = 1/1000 DT) — c'est l'unité
 * mineure entière de référence pour tout le dépôt (voir invariants
 * financiers, Master Prompt section 13).
 */

/**
 * Convertit un montant decimal (string Postgres `numeric`, ou number) en
 * entier de millimes. Arrondit à l'entier le plus proche (jamais de troncature
 * silencieuse) pour absorber les imprécisions résiduelles du stockage
 * `decimal`/`float` en amont.
 */
export function toMillimes(amount: string | number): number {
  const value = typeof amount === "number" ? amount : Number.parseFloat(amount)
  if (!Number.isFinite(value)) {
    throw new Error(`toMillimes: montant invalide "${amount}" (non fini).`)
  }
  return Math.round(value * 1000)
}

/**
 * Convertit un entier de millimes en chaîne decimal TND (3 décimales),
 * format compatible avec les colonnes `numeric(_, 3)` existantes.
 */
export function fromMillimes(millimes: number): string {
  return (millimes / 1000).toFixed(3)
}
