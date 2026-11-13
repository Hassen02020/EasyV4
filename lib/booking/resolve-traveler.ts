/**
 * DRAFT-PII-URL-01/02 — résolution serveur du voyageur d'un brouillon : cookie
 * chiffré du brouillon (`t` valide) uniquement. Sinon `null` : le client
 * ressaisit ses informations. Aucun voyageur n'est lu dans l'URL.
 * Serveur uniquement (lit les cookies).
 */
import { cookies } from "next/headers"
import type { DraftPayload } from "./draft-store"
import type { TravelerInput } from "./schemas"
import {
  isTravelerRef,
  openTraveler,
  travelerCookieName,
} from "./traveler-cookie"

export type ResolvedTraveler = { traveler: TravelerInput }

export async function resolveTraveler(
  _payload: DraftPayload | null,
  ref: string | undefined | null,
): Promise<ResolvedTraveler | null> {
  if (!isTravelerRef(ref)) return null
  const store = await cookies()
  const opened = openTraveler(ref, store.get(travelerCookieName(ref))?.value)
  return opened ? { traveler: opened.traveler } : null
}
