/**
 * Formatage monétaire pour la Tunisie
 * Virgule décimale française + 3 décimales (millimes)
 */

export function formatTND(amount: number): string {
  return `${amount.toLocaleString("fr-FR", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })} DT`
}

export function formatPrice(amount: number, currency: string = "TND"): string {
  if (currency === "TND") {
    return formatTND(amount)
  }
  return `${amount.toFixed(2)} ${currency}`
}

export function pluralizeHotels(count: number): string {
  return count === 1 ? "1 hôtel" : `${count} hôtels`
}
