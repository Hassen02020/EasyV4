/**
 * Panier multi-produits B2C — types partagés.
 *
 * Portée délibérément limitée à ce pass : Hôtel, Voyage organisé et
 * Attraction, les 3 seuls modules qui ont (a) un guest checkout réel
 * (`createGuestReservationFromDraft`/`createGuestPackageBooking`/
 * `createGuestActivityBooking`) ET (b) une forme "traveler" suffisamment
 * proche pour partager une ligne de panier autonome.
 *
 * Omra est délibérément EXCLU : son guest checkout attend une liste de
 * pèlerins (passeport, contact d'urgence, données médicales — voir
 * `OmraGuestBookingInput`), une forme trop différente d'un simple
 * traveler+adultes/enfants pour être traitée comme une ligne de panier
 * générique sans fabriquer une UI dédiée — hors scope de cette passe.
 *
 * Transfert est délibérément EXCLU : `createTransferBooking`
 * (lib/transfers/actions.ts) est un moteur B2B (`runInTenantContext`,
 * règlement par `debitPartnerCredit`) — aucun guest checkout B2C n'existe
 * pour ce module aujourd'hui. Ce n'est pas une limitation du panier, c'est
 * un gap produit distinct et antérieur.
 *
 * Chaque ligne porte sa propre sélection COMPLÈTE et déjà validée (même
 * shape que ce que son module enverrait immédiatement à son guest action)
 * — le panier ne fait que différer l'appel, jamais recalculer un prix ou
 * une disponibilité localement : le prix/dispo réels sont re-vérifiés par
 * chaque action serveur au moment du "Confirmer le panier", exactement
 * comme un achat individuel.
 */

import type { BookingDraft, TravelerInput } from "@/lib/booking/schemas"
import type { PackageGuestBookingInput } from "@/lib/packages/schemas"
import type { ActivityGuestBookingInput } from "@/lib/activities/schemas"

export const CART_STORAGE_KEY = "easy2book_cart_v1"

export interface CartLineHotel {
  id: string
  module: "hotel"
  addedAt: string
  title: string
  priceTnd: number
  draft: BookingDraft
  traveler: TravelerInput
}

export interface CartLinePackage {
  id: string
  module: "package"
  addedAt: string
  title: string
  priceTnd: number
  booking: PackageGuestBookingInput
}

export interface CartLineActivity {
  id: string
  module: "activity"
  addedAt: string
  title: string
  priceTnd: number
  booking: ActivityGuestBookingInput
}

export type CartLine = CartLineHotel | CartLinePackage | CartLineActivity

/** Omit distributif — un simple `Omit<CartLine, ...>` collapse l'union en
 * les champs communs seulement ; ceci préserve chaque variante (le
 * paramètre générique nu `T` est requis pour que le conditionnel
 * distribue réellement sur l'union, contrairement à `CartLine extends ...`
 * qui ne distribue jamais sur un type nommé directement). */
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never
export type NewCartLine = DistributiveOmit<CartLine, "id" | "addedAt">

export type CartCheckoutMethod = "transfer" | "cash"
