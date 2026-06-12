"use client"

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react"
import {
  type Currency,
  type CurrencyMeta,
  DEFAULT_CURRENCY,
  CURRENCY_META,
  CURRENCY_STORAGE_KEY,
  parseCurrency,
  formatCurrency,
} from "@/lib/currency"

interface CurrencyContextValue {
  currency: Currency
  setCurrency: (c: Currency) => void
  meta: CurrencyMeta
  /** Formate un montant TND dans la devise active. */
  format: (amountTND: number) => string
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null)

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<Currency>(DEFAULT_CURRENCY)

  useEffect(() => {
    const stored = parseCurrency(localStorage.getItem(CURRENCY_STORAGE_KEY))
    setCurrencyState(stored)
  }, [])

  const setCurrency = (c: Currency) => {
    setCurrencyState(c)
    localStorage.setItem(CURRENCY_STORAGE_KEY, c)
  }

  return (
    <CurrencyContext.Provider
      value={{
        currency,
        setCurrency,
        meta: CURRENCY_META[currency],
        format: (amountTND: number) => formatCurrency(amountTND, currency),
      }}
    >
      {children}
    </CurrencyContext.Provider>
  )
}

export function useCurrency(): CurrencyContextValue {
  const ctx = useContext(CurrencyContext)
  if (!ctx) throw new Error("useCurrency must be used within CurrencyProvider")
  return ctx
}
