/**
 * Logique pure de préparation d'une réservation hôtel myGo.
 *
 * Extraite de `lib/booking/actions.ts` ("use server", dépend de la session/DB)
 * pour rester testable sans I/O : pas de fetch, pas d'auth, pas de Drizzle.
 */

import { z } from "zod"
import type { BookingDraft, TravelerInput } from "./schemas"
import type { CreateBookingInput } from "@/lib/mygo"

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
    currency: draft.currency,
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
