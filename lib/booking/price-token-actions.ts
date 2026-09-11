"use server"

/**
 * Server Action dédiée : permet aux composants client (ex.
 * components/booking/checkout-form.tsx::onAddToCart) de revérifier le prix
 * hôtel d'un brouillon SANS jamais exécuter `node:crypto`/le secret HMAC
 * côté navigateur — voir lib/booking/price-token.ts pour le mécanisme et la
 * preuve live du bug corrigé.
 */

import { decodeDraft } from "./draft-store"
import { resolveDraftHotelPrice, type ResolvedDraftHotelPrice } from "./price-token"

export async function resolveDraftPriceAction(
  token: string,
): Promise<ResolvedDraftHotelPrice | { unitPriceTnd: number; verified: false; reason: "invalid_draft" }> {
  const payload = decodeDraft(token)
  if (!payload) {
    return { unitPriceTnd: 0, verified: false, reason: "invalid_draft" }
  }
  return resolveDraftHotelPrice(payload.draft)
}
