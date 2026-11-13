"use server"
/**
 * DRAFT-PII-URL-01 — actions serveur qui posent / relisent le cookie voyageur.
 * Le cookie n'est lisible que côté serveur (HttpOnly).
 */
import { cookies } from "next/headers"
import { decodeDraft } from "./draft-store"
import { resolveTraveler } from "./resolve-traveler"
import { travelerSchemaWithIdRule, type TravelerInput } from "./schemas"
import {
  TRAVELER_COOKIE_MAX,
  TRAVELER_COOKIE_PREFIX,
  TRAVELER_COOKIE_TTL_MS,
  isTravelerRef,
  newTravelerRef,
  openTraveler,
  sealTraveler,
  travelerCookieName,
} from "./traveler-cookie"

export type SaveTravelerResult =
  | { ok: true; ref: string }
  | { ok: false; error: string }

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: TRAVELER_COOKIE_TTL_MS / 1000,
}

/** Valide le voyageur, le chiffre dans un cookie propre au brouillon. */
export async function saveTravelerAction(
  traveler: TravelerInput,
  previousRef?: string,
): Promise<SaveTravelerResult> {
  const parsed = travelerSchemaWithIdRule.safeParse(traveler)
  if (!parsed.success) {
    return { ok: false, error: "Informations voyageur invalides" }
  }
  const store = await cookies()
  // Même brouillon retravaillé : on remplace son cookie ; sinon nouveau brouillon.
  const ref =
    previousRef && isTravelerRef(previousRef) ? previousRef : newTravelerRef()
  // Élagage : on garde au plus MAX - 1 autres brouillons (les plus récents).
  const others = store
    .getAll()
    .filter(
      (c) =>
        c.name.startsWith(TRAVELER_COOKIE_PREFIX) &&
        c.name !== TRAVELER_COOKIE_PREFIX + ref,
    )
    .map((c) => {
      const r = c.name.slice(TRAVELER_COOKIE_PREFIX.length)
      const opened = isTravelerRef(r) ? openTraveler(r, c.value) : null
      return { name: c.name, iat: opened?.iat ?? -1 }
    })
    .sort((a, b) => b.iat - a.iat)
  for (const old of others.slice(TRAVELER_COOKIE_MAX - 1)) {
    store.delete(old.name)
  }
  store.set(
    travelerCookieName(ref),
    sealTraveler(ref, parsed.data),
    COOKIE_OPTS,
  )
  return { ok: true, ref }
}

/**
 * Relit le voyageur du navigateur courant : cookie du brouillon, sinon ancien
 * `?d=` (jusqu'à la date de fin de lecture). Sert au bouton « Ajouter au panier ».
 */
export async function readTravelerAction(
  ref: string | undefined | null,
  token: string | undefined | null,
): Promise<TravelerInput | null> {
  const resolved = await resolveTraveler(decodeDraft(token), ref)
  return resolved?.traveler ?? null
}
