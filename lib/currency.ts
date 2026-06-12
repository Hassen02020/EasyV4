export const CURRENCIES = ["TND", "EUR", "USD"] as const
export type Currency = (typeof CURRENCIES)[number]

export const DEFAULT_CURRENCY: Currency = "TND"
export const CURRENCY_STORAGE_KEY = "e2b_currency"

export interface CurrencyMeta {
  label: string
  symbol: string
  flag: string
  /** Rate vs TND (base) */
  rateFromTND: number
}

export const CURRENCY_META: Record<Currency, CurrencyMeta> = {
  TND: { label: "Dinar tunisien", symbol: "DT", flag: "🇹🇳", rateFromTND: 1 },
  EUR: { label: "Euro", symbol: "€", flag: "🇪🇺", rateFromTND: 0.3 },
  USD: { label: "US Dollar", symbol: "$", flag: "🇺🇸", rateFromTND: 0.32 },
}

/** Converts an amount in TND to the target currency */
export function convertFromTND(amountTND: number, target: Currency): number {
  return amountTND * CURRENCY_META[target].rateFromTND
}

/** Formats a converted amount with symbol */
export function formatCurrency(amountTND: number, currency: Currency): string {
  const converted = convertFromTND(amountTND, currency)
  const meta = CURRENCY_META[currency]
  const formatted = converted.toLocaleString("fr-FR", {
    minimumFractionDigits: currency === "TND" ? 0 : 2,
    maximumFractionDigits: currency === "TND" ? 0 : 2,
  })
  return currency === "TND"
    ? `${formatted} ${meta.symbol}`
    : `${meta.symbol}${formatted}`
}

export function parseCurrency(value: string | null | undefined): Currency {
  if (value && (CURRENCIES as readonly string[]).includes(value)) {
    return value as Currency
  }
  return DEFAULT_CURRENCY
}
