"use client"

import {
  createContext,
  useContext,
  useSyncExternalStore,
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

/**
 * Store externe (localStorage) partagé via useSyncExternalStore : évite le
 * double-rendu (defaut → valeur stockée) qu'un useEffect + setState causerait
 * au montage.
 */
const listeners = new Set<() => void>()

function subscribe(callback: () => void) {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

function getSnapshot(): Currency {
  return parseCurrency(localStorage.getItem(CURRENCY_STORAGE_KEY))
}

function getServerSnapshot(): Currency {
  return DEFAULT_CURRENCY
}

function setStoredCurrency(c: Currency) {
  localStorage.setItem(CURRENCY_STORAGE_KEY, c)
  listeners.forEach((listener) => listener())
}

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const currency = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  return (
    <CurrencyContext.Provider
      value={{
        currency,
        setCurrency: setStoredCurrency,
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
