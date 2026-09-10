/**
 * Logique pure de préparation d'une réservation hôtel myGo.
 *
 * Extraite de `lib/booking/actions.ts` ("use server", dépend de la session/DB)
 * pour rester testable sans I/O : pas de fetch, pas d'auth, pas de Drizzle.
 */

import { z } from "zod"
import type { BookingDraft, TravelerInput } from "./schemas"
import {
  MyGoApiError,
  MyGoAuthError,
  MyGoCircuitOpenError,
  MyGoNetworkError,
  MyGoSchemaError,
  MyGoTimeoutError,
  type CreateBookingInput,
} from "@/lib/mygo"

/**
 * Sous-ensemble de `BookingDraft.metadata` propre aux réservations hôtel
 * issues d'une vraie recherche myGo (HotelSearch). Un draft "hôtel" sans ces
 * champs (ex. offre démo homepage) n'est PAS confirmé auprès du fournisseur —
 * voir `extractHotelProviderMetadata`.
 */
export const hotelProviderMetadataSchema = z.object({
  myGoToken: z.string().min(1),
  cityId: z.number().int().positive(),
  hotelId: z.number().int().positive().optional(),
  boardingId: z.number().int().positive(),
  boardingCode: z.string().optional(),
  roomId: z.number().int().positive(),
  /** Âges réels des enfants (capturés à la recherche), un élément par enfant. */
  childrenAges: z.array(z.number().int().min(0).max(17)).optional(),
})

export type HotelProviderMetadata = z.infer<typeof hotelProviderMetadataSchema>

/**
 * Extrait et valide les métadonnées myGo d'un draft.
 * Renvoie `null` si absentes/invalides — le draft n'est alors pas une offre
 * hôtel réelle myGo (ex. offre démo) et ne doit pas déclencher de
 * BookingCreation fournisseur.
 */
export function extractHotelProviderMetadata(
  metadata: Record<string, unknown> | undefined,
): HotelProviderMetadata | null {
  if (!metadata) return null
  const parsed = hotelProviderMetadataSchema.safeParse(metadata)
  return parsed.success ? parsed.data : null
}

const CIVILITY_FALLBACK = "M"
/** Âge par défaut si un enfant du draft n'a pas d'âge connu en métadonnées. */
const DEFAULT_CHILD_AGE = 10

/**
 * Construit la requête BookingCreation myGo à partir du brouillon + voyageur
 * principal.
 *
 * Limitation connue et assumée : le tunnel de réservation ne collecte
 * aujourd'hui que l'identité d'UN voyageur principal (le "Holder"). Les
 * adultes additionnels sont donc envoyés avec un nom générique dérivé du nom
 * de famille du voyageur principal (myGo exige Name/Surname par adulte).
 * Les âges des enfants, eux, sont réels (capturés lors de la recherche et
 * transmis dans `providerMeta.childrenAges`) — seuls leurs noms sont
 * génériques.
 */
export function buildMyGoBookingRequest(input: {
  draft: BookingDraft
  traveler: TravelerInput
  providerMeta: HotelProviderMetadata
  methodPayment?: number
}): CreateBookingInput {
  const { draft, traveler, providerMeta } = input

  const extraAdultsCount = Math.max(0, draft.adults - 1)
  const adults = [
    {
      civility: traveler.civility,
      name: traveler.firstName,
      surname: traveler.lastName,
      holder: true,
    },
    ...Array.from({ length: extraAdultsCount }, (_, i) => ({
      civility: CIVILITY_FALLBACK,
      name: `Voyageur ${i + 2}`,
      surname: traveler.lastName,
      holder: false,
    })),
  ]

  const ages = providerMeta.childrenAges ?? []
  const children = Array.from({ length: draft.children }, (_, i) => ({
    name: `Enfant ${i + 1}`,
    surname: traveler.lastName,
    age: ages[i] ?? DEFAULT_CHILD_AGE,
  }))

  return {
    token: providerMeta.myGoToken,
    cityId: providerMeta.cityId,
    hotelId: providerMeta.hotelId ?? Number(draft.offerId),
    checkIn: draft.startDate,
    checkOut: draft.endDate ?? draft.startDate,
    // Pas de `currency` ici : MyGoClient.createBooking force TND côté serveur,
    // indépendamment de `draft.currency` (client-contrôlable, non signé).
    methodPayment: input.methodPayment,
    rooms: [
      {
        roomId: providerMeta.roomId,
        boardingId: providerMeta.boardingId,
        adults,
        children: children.length > 0 ? children : undefined,
      },
    ],
  }
}

/**
 * Réconcilie le prix avec le `TotalPrice` AUTORITAIRE renvoyé par myGo
 * BookingCreation, plutôt que de faire confiance au `unitPriceTnd` fourni
 * par le client (le brouillon est un token base64url non signé — donc
 * altérable côté client avant d'atteindre le Server Action).
 *
 * On réinjecte ce total dans le même pipeline de pricing (TVA/acompte) que
 * le reste de l'app : `unitChildPriceTnd: 0` car le total myGo couvre déjà
 * toute l'occupation de la chambre (adultes + enfants), pas un tarif par
 * personne.
 */
/**
 * Vérification de cohérence après confirmation myGo : si le Hotel.Id renvoyé
 * par BookingCreation ne correspond pas à celui attendu (métadonnées de
 * recherche), on refuse — soit une réponse fournisseur incohérente, soit un
 * draft manipulé pointant vers un hôtel différent du token/contexte de
 * recherche d'origine. Ne fait rien si myGo n'a pas renvoyé de Hotel.Id
 * (champ optionnel côté schéma permissif).
 */
export function bookingConfirmationMatchesExpectedHotel(
  booking: { hotelId?: number },
  providerMeta: HotelProviderMetadata,
): boolean {
  const expected = providerMeta.hotelId
  if (expected == null || booking.hotelId == null) return true
  return booking.hotelId === expected
}

export function authoritativeUnitPrice(
  totalPriceFromProvider: number,
  adults: number,
): { unitPriceTnd: number; unitChildPriceTnd: number } {
  const safeAdults = adults > 0 ? adults : 1
  return {
    unitPriceTnd: totalPriceFromProvider / safeAdults,
    unitChildPriceTnd: 0,
  }
}

// ---------------------------------------------------------------------------
// Classification des erreurs BookingCreation/BookingCancellation
// ---------------------------------------------------------------------------

export type MyGoBookingErrorKind =
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "AUTHENTICATION_ERROR"
  | "MYGO_BUSINESS_ERROR"
  | "NO_AVAILABILITY"
  | "PRICE_CHANGED"
  | "MALFORMED_RESPONSE"
  | "CIRCUIT_OPEN"
  /** Timeout/réseau : on ne sait pas si myGo a créé la résa. Réconciliation tentée, sans succès univoque. */
  | "AMBIGUOUS_SUPPLIER_STATE"
  | "UNKNOWN_ERROR"

/** Erreurs après lesquelles on NE SAIT PAS si myGo a effectivement créé la réservation. */
const AMBIGUOUS_ERROR_KINDS: readonly MyGoBookingErrorKind[] = [
  "NETWORK_ERROR",
  "TIMEOUT",
  "MALFORMED_RESPONSE",
]

export function isAmbiguousBookingError(kind: MyGoBookingErrorKind): boolean {
  return AMBIGUOUS_ERROR_KINDS.includes(kind)
}

/**
 * Classe une erreur levée par `MyGoClient.createBooking`/`cancelBooking`.
 *
 * myGo ne documente pas de table de codes d'erreur applicatifs stables — on
 * ne peut donc distinguer NO_AVAILABILITY / PRICE_CHANGED d'une erreur
 * métier générique que par heuristique sur le texte de `Description`
 * (même approche que `isAuthError` dans lib/mygo/client.ts). Si le texte ne
 * correspond à rien de connu, on retombe sur MYGO_BUSINESS_ERROR plutôt que
 * d'inventer une classification non fondée.
 */
export function classifyMyGoBookingError(err: unknown): MyGoBookingErrorKind {
  if (err instanceof MyGoCircuitOpenError) return "CIRCUIT_OPEN"
  if (err instanceof MyGoAuthError) return "AUTHENTICATION_ERROR"
  if (err instanceof MyGoSchemaError) return "MALFORMED_RESPONSE"
  if (err instanceof MyGoTimeoutError) return "TIMEOUT"
  if (err instanceof MyGoNetworkError) return "NETWORK_ERROR"
  if (err instanceof MyGoApiError) {
    const desc = err.description ?? ""
    if (/prix|tarif|price|tariff/i.test(desc)) return "PRICE_CHANGED"
    if (/disponib|availab|sold.?out|complet/i.test(desc)) {
      return "NO_AVAILABILITY"
    }
    return "MYGO_BUSINESS_ERROR"
  }
  return "UNKNOWN_ERROR"
}

/** Message utilisateur (FR) — ne jamais exposer le détail technique/XML/JSON brut. */
export function describeMyGoBookingErrorForUser(
  kind: MyGoBookingErrorKind,
): string {
  switch (kind) {
    case "PRICE_CHANGED":
    case "NO_AVAILABILITY":
    case "MYGO_BUSINESS_ERROR":
      return "Cette offre n'est plus disponible (prix ou disponibilité modifiés). Merci de relancer une recherche."
    case "AUTHENTICATION_ERROR":
    case "CIRCUIT_OPEN":
      return "Le service de réservation hôtelière est momentanément indisponible. Merci de réessayer dans quelques instants."
    case "AMBIGUOUS_SUPPLIER_STATE":
      return "Nous n'avons pas pu confirmer l'état de votre réservation auprès de l'hôtel suite à un problème technique. Ne retentez pas la réservation — contactez le support avec la référence de votre recherche."
    case "TIMEOUT":
    case "NETWORK_ERROR":
    case "MALFORMED_RESPONSE":
      return "Impossible de confirmer la réservation auprès de l'hôtel. Merci de réessayer."
    case "UNKNOWN_ERROR":
    default:
      return "Erreur inattendue lors de la confirmation auprès du fournisseur."
  }
}

/** Même classification que la création, wording adapté au contexte annulation. */
export function describeMyGoCancellationErrorForUser(
  kind: MyGoBookingErrorKind,
): string {
  switch (kind) {
    case "MYGO_BUSINESS_ERROR":
    case "PRICE_CHANGED":
    case "NO_AVAILABILITY":
      return "Le fournisseur a refusé l'annulation. Merci de contacter le support."
    case "AUTHENTICATION_ERROR":
    case "CIRCUIT_OPEN":
      return "Le service fournisseur est momentanément indisponible. Merci de réessayer dans quelques instants."
    case "AMBIGUOUS_SUPPLIER_STATE":
      return "Nous n'avons pas pu confirmer si l'annulation a été prise en compte par l'hôtel. Ne marquez pas cette réservation comme annulée sans vérification manuelle."
    default:
      return "Impossible d'annuler la réservation auprès du fournisseur. Merci de réessayer."
  }
}

/**
 * PHASE 27.1 — même wording que `describeMyGoCancellationErrorForUser`, mais
 * pour un résultat déjà normalisé par le Hub (`SupplierCancellationResult`,
 * lib/hotel-suppliers/core/types.ts) plutôt qu'une exception `MyGoClient`
 * brute — c'est le chemin utilisé par `driver.cancel()`. L'annulation est
 * retry-safe côté fournisseur (contrairement à la création) : pas de notion
 * d'état "ambigu" ici, un échec peut toujours être retenté sans risque.
 */
export function describeSupplierCancellationErrorForUser(code: string): string {
  switch (code) {
    case "AUTH_ERROR":
      return "Le service fournisseur est momentanément indisponible. Merci de réessayer dans quelques instants."
    case "TIMEOUT":
      return "Impossible de confirmer l'annulation auprès du fournisseur. Merci de réessayer."
    case "NOT_CONFIGURED":
      return "Ce fournisseur n'est pas configuré pour votre compte. Merci de contacter le support."
    default:
      return "Le fournisseur a refusé l'annulation. Merci de contacter le support."
  }
}

// ---------------------------------------------------------------------------
// Réconciliation après échec ambigu (voir isAmbiguousBookingError)
// ---------------------------------------------------------------------------

export interface BookingReconciliationCandidate {
  bookingId: number
  hotelId?: number
  checkIn?: string
  checkOut?: string
  state?: string
  /** Format myGo "YYYY-MM-DD HH24:MI". */
  createdAt?: string
}

/** Parse le format de date myGo "YYYY-MM-DD HH24:MI" en timestamp ms. `null` si invalide. */
export function parseMyGoTimestamp(value: string): number | null {
  const normalized = value.includes("T") ? value : value.replace(" ", "T")
  const t = Date.parse(normalized)
  return Number.isFinite(t) ? t : null
}

/**
 * Tente de désambiguïser un état incertain après une erreur réseau/timeout
 * sur BookingCreation : on ne sait pas si myGo a créé la réservation avant
 * que la réponse ne se perde.
 *
 * N'adopte un candidat que s'il y en a EXACTEMENT UN qui correspond à
 * l'hôtel/dates attendus, n'est pas annulé, et a été créé dans la fenêtre
 * récente — sinon on renvoie `null` (mieux vaut un état signalé comme
 * ambigu que d'en deviner un faux). C'est un mécanisme de réconciliation en
 * lecture seule (BookingList, documenté par myGo) — pas une clé
 * d'idempotence inventée : myGo n'en documente pas.
 */
export function reconcileAmbiguousBooking(
  candidates: BookingReconciliationCandidate[],
  expected: { hotelId: number; checkIn: string; checkOut: string },
  nowMs: number,
  windowMinutes = 10,
): BookingReconciliationCandidate | null {
  const cutoff = nowMs - windowMinutes * 60_000
  const matches = candidates.filter((c) => {
    if (c.hotelId !== expected.hotelId) return false
    if (c.checkIn !== expected.checkIn) return false
    if (c.checkOut !== expected.checkOut) return false
    if (c.state === "Cancelled") return false
    if (!c.createdAt) return false
    const created = parseMyGoTimestamp(c.createdAt)
    if (created == null || created < cutoff) return false
    return true
  })
  return matches.length === 1 ? matches[0]! : null
}
