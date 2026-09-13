/**
 * Signature serveur du prix d'une chambre hôtel B2C, au moment où
 * `/api/hotels/search-public` le calcule (source de vérité serveur,
 * chargée depuis myGo). Le brouillon de réservation (`draft-store.ts`)
 * est construit et encodé CÔTÉ NAVIGATEUR (`app/hotels/[id]/page.tsx`,
 * `app/hotels/search/page.tsx`) — un simple base64url JSON non signé,
 * donc entièrement modifiable par le client une fois dans l'URL.
 *
 * Preuve live (certification E2E) : un draft trafiqué avec
 * `unitPriceTnd` ramené à 1 TND, `myGoToken` inchangé, faisait toujours
 * facturer le vrai prix fournisseur côté serveur (jamais de perte
 * financière — `confirmHotelWithProvider` ignore déjà le prix client à
 * la capture), MAIS l'écran `/booking/checkout` AFFICHAIT le total
 * falsifié avant paiement (`components/booking/checkout-form.tsx`
 * calculait `draft.unitPriceTnd * draft.adults` sans aucune vérification
 * serveur) — un client pouvait voir un montant puis en payer un autre.
 *
 * Ce module signe (HMAC-SHA256) le prix exact que `/api/hotels/
 * search-public` a réellement renvoyé pour {hotel, chambre, board, dates,
 * adultes, devise}, et permet de le revérifier avant tout affichage
 * financier ultérieur (checkout). Aucun second appel fournisseur requis
 * (contrairement à un "CheckRate" complet, déjà écarté pour coût/latence
 * — voir Phase 30.1) : on ne fait que rendre infalsifiable un prix déjà
 * légitimement calculé par le serveur quelques instants plus tôt.
 */

import { createHmac, timingSafeEqual } from "crypto"

const SECRET =
  process.env.PRICE_TOKEN_SECRET ?? "price-token-dev-secret-not-for-prod"

/** Fenêtre de validité — alignée sur une session de recherche/réservation réaliste. */
export const HOTEL_PRICE_TOKEN_TTL_MS = 45 * 60 * 1000

export interface HotelPriceTokenContext {
  hotelId: number
  roomId: number
  boardingId: number
  checkin: string
  checkout: string
  adults: number
  currency: string
}

export interface HotelPriceTokenFields extends HotelPriceTokenContext {
  unitPriceTnd: number
}

function base64urlEncode(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url")
}

function base64urlDecode(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8")
}

function sign(payloadB64: string): string {
  return createHmac("sha256", SECRET).update(payloadB64).digest("base64url")
}

/** Signe le prix exact calculé serveur pour cette chambre/board/dates/occupation. */
export function signHotelPriceToken(fields: HotelPriceTokenFields): string {
  const issuedAt = Date.now()
  const payloadB64 = base64urlEncode(JSON.stringify({ ...fields, issuedAt }))
  return `${payloadB64}.${sign(payloadB64)}`
}

export type VerifyHotelPriceTokenResult =
  | { ok: true; unitPriceTnd: number }
  | {
      ok: false
      reason: "malformed" | "signature" | "expired" | "mismatch"
    }

/**
 * Revérifie un token émis par `signHotelPriceToken`. `expected` doit
 * provenir du brouillon EN COURS (hotelId/roomId/boardingId/dates/
 * adultes/devise) : si le client a changé la chambre/les dates/le nombre
 * d'adultes sans repasser par une recherche fraîche, ou a essayé de
 * réutiliser un token valide d'une AUTRE chambre moins chère, la
 * vérification échoue (`mismatch`) — jamais un prix d'une offre
 * différente accepté silencieusement.
 */
export function verifyHotelPriceToken(
  token: string | undefined | null,
  expected: HotelPriceTokenContext,
  ttlMs: number = HOTEL_PRICE_TOKEN_TTL_MS,
): VerifyHotelPriceTokenResult {
  if (!token || typeof token !== "string") return { ok: false, reason: "malformed" }
  const dotIndex = token.indexOf(".")
  if (dotIndex <= 0 || dotIndex === token.length - 1) {
    return { ok: false, reason: "malformed" }
  }
  const payloadB64 = token.slice(0, dotIndex)
  const sig = token.slice(dotIndex + 1)

  const expectedSig = sign(payloadB64)
  const sigBuf = Buffer.from(sig, "base64url")
  const expectedSigBuf = Buffer.from(expectedSig, "base64url")
  if (
    sigBuf.length !== expectedSigBuf.length ||
    !timingSafeEqual(sigBuf, expectedSigBuf)
  ) {
    return { ok: false, reason: "signature" }
  }

  let parsed: HotelPriceTokenFields & { issuedAt: number }
  try {
    parsed = JSON.parse(base64urlDecode(payloadB64))
  } catch {
    return { ok: false, reason: "malformed" }
  }
  if (
    typeof parsed.issuedAt !== "number" ||
    typeof parsed.unitPriceTnd !== "number" ||
    !Number.isFinite(parsed.unitPriceTnd)
  ) {
    return { ok: false, reason: "malformed" }
  }

  if (Date.now() - parsed.issuedAt > ttlMs) return { ok: false, reason: "expired" }

  if (
    parsed.hotelId !== expected.hotelId ||
    parsed.roomId !== expected.roomId ||
    parsed.boardingId !== expected.boardingId ||
    parsed.checkin !== expected.checkin ||
    parsed.checkout !== expected.checkout ||
    parsed.adults !== expected.adults ||
    parsed.currency !== expected.currency
  ) {
    return { ok: false, reason: "mismatch" }
  }

  return { ok: true, unitPriceTnd: parsed.unitPriceTnd }
}

/**
 * Ajoute un `priceToken` signé à chaque chambre d'un `HotelSearchResultDTO`
 * déjà calculé par `executeHotelSearchThroughHub` — utilisé UNIQUEMENT par
 * `/api/hotels/search-public` (tunnel B2C ; le tunnel B2B applique une
 * marge après coup et n'a pas ce problème d'affichage pré-paiement, voir
 * tête de fichier). Traite le JSON en forme libre (pas de nouveau champ
 * dans `lib/mygo/types.ts`) pour ne modifier ni le DTO canonique partagé
 * B2B/B2C, ni son test de non-régression `réponse HTTP identique`.
 */
export interface ResolvedDraftHotelPrice {
  /** Prix unitaire À AFFICHER — jamais celui du brouillon client seul quand `verified` est faux. */
  unitPriceTnd: number
  /** true uniquement si un `priceToken` serveur a été revérifié avec succès pour EXACTEMENT ce brouillon. */
  verified: boolean
  /** Raison d'échec — jamais affichée telle quelle à l'utilisateur, seulement pour log/debug. */
  reason?: "not_hotel" | "no_token" | Extract<VerifyHotelPriceTokenResult, { ok: false }>["reason"]
}

/**
 * Revérifie le prix hôtel porté par un brouillon (`draft.metadata.priceToken`,
 * ajouté par `signHotelSearchOffersInPlace` au moment de la recherche) contre
 * son contexte EXACT (hôtel/chambre/board/dates/adultes/devise, tous tirés du
 * MÊME brouillon — jamais d'une source externe). Utilisé par les écrans qui
 * affichent un montant AVANT paiement (`/booking`, `/booking/checkout`) pour
 * ne jamais faire confiance à `draft.unitPriceTnd` seul — voir tête de
 * fichier pour la preuve live du bug corrigé. Modules non-hôtel (vol/
 * transfert/omra/package/activité) n'ont pas ce mécanisme : `verified` reste
 * `false` et l'appelant continue d'utiliser `draft.unitPriceTnd` tel quel
 * (comportement historique inchangé, hors périmètre de cette faille).
 */
export function resolveDraftHotelPrice(draft: {
  module: string
  unitPriceTnd: number
  startDate: string
  endDate?: string
  adults: number
  currency: string
  metadata?: Record<string, unknown> | null
}): ResolvedDraftHotelPrice {
  if (draft.module !== "hotel") {
    return { unitPriceTnd: draft.unitPriceTnd, verified: false, reason: "not_hotel" }
  }
  const meta = draft.metadata ?? undefined
  const token = typeof meta?.priceToken === "string" ? meta.priceToken : undefined
  const hotelId = typeof meta?.hotelId === "number" ? meta.hotelId : undefined
  const roomId = typeof meta?.roomId === "number" ? meta.roomId : undefined
  const boardingId = typeof meta?.boardingId === "number" ? meta.boardingId : undefined
  if (!token || hotelId == null || roomId == null || boardingId == null || !draft.endDate) {
    return { unitPriceTnd: draft.unitPriceTnd, verified: false, reason: "no_token" }
  }
  const result = verifyHotelPriceToken(token, {
    hotelId,
    roomId,
    boardingId,
    checkin: draft.startDate,
    checkout: draft.endDate,
    adults: draft.adults,
    currency: draft.currency,
  })
  if (!result.ok) {
    return { unitPriceTnd: draft.unitPriceTnd, verified: false, reason: result.reason }
  }
  return { unitPriceTnd: result.unitPriceTnd, verified: true }
}

export function signHotelSearchOffersInPlace(
  dto: {
    offers?: Array<{
      hotel?: { id?: number }
      currency?: string
      boardings?: Array<{
        id?: number
        pax?: Array<{
          adult?: number
          rooms?: Array<{ id?: number; price?: number; [k: string]: unknown }>
        }>
      }>
    }>
  },
  query: { checkin: string; checkout: string },
): void {
  for (const offer of dto.offers ?? []) {
    const hotelId = offer.hotel?.id
    const currency = offer.currency
    if (hotelId == null || !currency) continue
    for (const boarding of offer.boardings ?? []) {
      const boardingId = boarding.id
      if (boardingId == null) continue
      for (const pax of boarding.pax ?? []) {
        const adults = pax.adult
        if (!adults) continue
        for (const room of pax.rooms ?? []) {
          if (room.id == null || typeof room.price !== "number") continue
          ;(room as Record<string, unknown>).priceToken = signHotelPriceToken({
            hotelId,
            roomId: room.id,
            boardingId,
            checkin: query.checkin,
            checkout: query.checkout,
            adults,
            currency,
            unitPriceTnd: room.price / adults,
          })
        }
      }
    }
  }
}
