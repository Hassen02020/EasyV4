/**
 * Panier multi-produits B2C — persistance localStorage uniquement.
 *
 * Décision de portée (pas une règle métier inventée, un choix technique
 * documenté) : PAS de table BDD, PAS d'exigence de connexion. Le guest
 * checkout existant (createGuestReservationFromDraft/
 * createGuestPackageBooking/createGuestActivityBooking) ne requiert déjà
 * aucun compte Supabase (voir lib/booking/guest-actions.ts, doc de tête :
 * "un client peut réserver sans jamais s'authentifier") — exiger une
 * connexion seulement pour AJOUTER au panier casserait ce parcours et
 * ajouterait une friction jamais demandée. Un panier localStorage reste
 * disponible tant que le navigateur/onglet garde les données (pas de
 * synchronisation cross-device) — limite acceptée, pas cachée.
 *
 * Fonctions pures, pas de React ici (voir use-cart.ts pour le hook).
 */

import type { CartLine } from "./cart-types"
import { CART_STORAGE_KEY } from "./cart-types"

const EMPTY_CART: CartLine[] = []

// useSyncExternalStore (use-cart.ts) exige une référence STABLE tant que le
// contenu n'a pas changé, sinon il boucle indéfiniment (chaque re-render
// verrait un "nouveau" snapshot) — on ne re-parse donc que si la chaîne
// brute a réellement changé depuis le dernier appel.
let lastRaw: string | null = null
let lastParsed: CartLine[] = EMPTY_CART

export function readCart(): CartLine[] {
  if (typeof window === "undefined") return EMPTY_CART
  let raw: string | null
  try {
    raw = window.localStorage.getItem(CART_STORAGE_KEY)
  } catch {
    return EMPTY_CART
  }
  if (raw === lastRaw) return lastParsed
  lastRaw = raw
  if (!raw) {
    lastParsed = EMPTY_CART
    return lastParsed
  }
  try {
    const parsed = JSON.parse(raw)
    lastParsed = Array.isArray(parsed) ? (parsed as CartLine[]) : EMPTY_CART
  } catch {
    lastParsed = EMPTY_CART
  }
  return lastParsed
}

function writeCart(lines: CartLine[]): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(lines))
    // Permet à use-cart.ts (autres composants montés dans le même onglet)
    // de se resynchroniser immédiatement — l'event "storage" natif ne se
    // déclenche que sur les AUTRES onglets/fenêtres.
    window.dispatchEvent(new Event("easy2book_cart_updated"))
  } catch {
    // Quota dépassé / stockage désactivé — le panier reste simplement
    // non persisté pour cette session, jamais une exception qui casse le
    // parcours d'ajout.
  }
}

export function addCartLine(line: CartLine): CartLine[] {
  const lines = [...readCart(), line]
  writeCart(lines)
  return lines
}

export function removeCartLine(id: string): CartLine[] {
  const lines = readCart().filter((l) => l.id !== id)
  writeCart(lines)
  return lines
}

export function clearCart(): CartLine[] {
  writeCart([])
  return []
}

export function generateCartLineId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `cart-${Date.now()}-${Math.random().toString(36).slice(2)}`
}
