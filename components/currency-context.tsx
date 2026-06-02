"use client"

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react"
import {
  type Currency,
  DEFAULT_CURRENCY,
  CURRENCY_STORAGE_KEY,
  parseCurrency,
  formatCurrency,
  convertFromTND,
  CURRENCY_META,
} from "@/lib/currency"

interface CurrencyContextValue {
  currency: Currency
  setCurrency: (c: Currency) => void
  /** Format an amount (in TND base) to the active currency string */
  format: (amountTND: number) => string
  /** Convert an amount (in TND base) to the active currency number */
  convert: (amountTND: number) => number
  /** Metadata for the active currency */
  meta: (typeof CURRENCY_META)[Currency]
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null)

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<Currency>(DEFAULT_CURRENCY)

  useEffect(() => {
    const stored = parseCurrency(
      typeof window !== "undefined"
        ? localStorage.getItem(CURRENCY_STORAGE_KEY)
        : null,
    )
    setCurrencyState(stored)
  }, [])

  const setCurrency = useCallback((c: Currency) => {
    setCurrencyState(c)
    localStorage.setItem(CURRENCY_STORAGE_KEY, c)
  }, [])

  const format = useCallback(
    (amountTND: number) => formatCurrency(amountTND, currency),
    [currency],
  )

  const convert = useCallback(
    (amountTND: number) => convertFromTND(amountTND, currency),
    [currency],
  )

  return (
    <CurrencyContext.Provider
      value={{ currency, setCurrency, format, convert, meta: CURRENCY_META[currency] }}
    >
      {children}
    </CurrencyContext.Provider>
  )
}

export function useCurrency(): CurrencyContextValue {
  const ctx = useContext(CurrencyContext)
  if (!ctx) {
    throw new Error("useCurrency() must be used inside <CurrencyProvider>")
  }
  return ctx
}
