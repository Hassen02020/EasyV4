"use client"

import { useCallback, useSyncExternalStore } from "react"
import type { CartLine, NewCartLine } from "./cart-types"
import { addCartLine, clearCart, generateCartLineId, readCart, removeCartLine } from "./cart-store"

/**
 * Panier localStorage exposé via useSyncExternalStore — même pattern que
 * components/currency-context.tsx (évite le double-rendu défaut→valeur
 * stockée qu'un useEffect + setState causerait au montage, cf.
 * react-hooks/set-state-in-effect).
 */
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback)
  window.addEventListener("easy2book_cart_updated", callback)
  return () => {
    window.removeEventListener("storage", callback)
    window.removeEventListener("easy2book_cart_updated", callback)
  }
}

// Référence constante — useSyncExternalStore compare par Object.is, un
// `[]` littéral recréé à chaque appel provoquerait une boucle de rendu
// infinie côté SSR (même défaut que readCart() avant sa memoization).
const EMPTY_CART: CartLine[] = []

function getServerSnapshot(): CartLine[] {
  return EMPTY_CART
}

export function useCart() {
  const lines = useSyncExternalStore(subscribe, readCart, getServerSnapshot)

  const add = useCallback((line: NewCartLine) => {
    const full = { ...line, id: generateCartLineId(), addedAt: new Date().toISOString() } as CartLine
    addCartLine(full)
    return full
  }, [])

  const remove = useCallback((id: string) => {
    removeCartLine(id)
  }, [])

  const clear = useCallback(() => {
    clearCart()
  }, [])

  return { lines, add, remove, clear }
}
