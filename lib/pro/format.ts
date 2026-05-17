/**
 * Utilitaires d'affichage spécifiques au portail B2B.
 */

/**
 * Formate un montant TND au style observé dans les captures myGO :
 * `841,253 DT` (virgule décimale française, 3 décimales).
 */
export function formatTND(value: number, locale = "fr-FR"): string {
  if (!Number.isFinite(value)) return "0,000 DT"
  return `${value.toLocaleString(locale, {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })} DT`
}

/** Pluralisation simple pour le compteur d'hôtels. */
export function pluralizeHotels(count: number): string {
  if (count === 0) return "Aucun hôtel"
  if (count === 1) return "1 Hôtel"
  return `${count} Hôtels`
}
