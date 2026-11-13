/**
 * DRAFT-PII-URL-01 — résolution serveur du voyageur d'un brouillon :
 *  1. cookie chiffré du brouillon (`t` valide) — chemin normal ;
 *  2. sinon, ancien `?d=` contenant le voyageur, lu JUSQU'À
 *     LEGACY_TRAVELER_IN_URL_UNTIL (jamais réécrit dans une URL) ;
 *  3. sinon `null` : le client ressaisit ses informations.
 * Serveur uniquement (lit les cookies).
 */
import { cookies } from "next/headers"
import type { DraftPayload } from "./draft-store"
import type { TravelerInput } from "./schemas"
import {
  LEGACY_TRAVELER_IN_URL_UNTIL,
  isTravelerRef,
  openTraveler,
  travelerCookieName,
} from "./traveler-cookie"

export type ResolvedTraveler = {
  traveler: TravelerInput
  /** true : voyageur lu dans l'ancien `?d=` (clé d'idempotence d'origine). */
  legacy: boolean
}

export async function resolveTraveler(
  payload: DraftPayload | null,
  ref: string | undefined | null,
  nowMs = Date.now(),
): Promise<ResolvedTraveler | null> {
  if (isTravelerRef(ref)) {
    const store = await cookies()
    const opened = openTraveler(ref, store.get(travelerCookieName(ref))?.value)
    if (opened) return { traveler: opened.traveler, legacy: false }
  }
  if (payload?.traveler && nowMs < LEGACY_TRAVELER_IN_URL_UNTIL) {
    return { traveler: payload.traveler, legacy: true }
  }
  return null
}
