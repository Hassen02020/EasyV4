/**
 * Tokens opaques et signés du Virtual MyGo Supplier — même rôle que le
 * `Token` réel de HotelSearch : à renvoyer tel quel dans BookingCreation.
 *
 * Signé (HMAC) plutôt qu'un simple id incrémental pour pouvoir tester
 * légitimement : token invalide, altéré ("tampered"), expiré, et token
 * d'une autre recherche (item 15 du cahier des charges) — sans qu'aucune
 * de ces manipulations ne soit un simple "id qui n'existe pas dans une Map".
 */

import { createHmac, randomUUID } from "node:crypto"

const SECRET =
  process.env.VIRTUAL_MYGO_TOKEN_SECRET ?? "virtual-mygo-dev-secret-not-for-prod"

const TOKEN_TTL_MS = 15 * 60_000 // 15 min — proche du comportement réel documenté ("Token... Expire")

export interface TokenPayload {
  searchId: string
  hotelId: number
  cityId: number
  checkIn: string
  checkOut: string
  issuedAt: number
  expiresAt: number
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
}

function sign(payload: string): string {
  return b64url(createHmac("sha256", SECRET).update(payload).digest())
}

export function newSearchId(): string {
  return randomUUID()
}

export function issueToken(input: {
  searchId: string
  hotelId: number
  cityId: number
  checkIn: string
  checkOut: string
}): string {
  const now = Date.now()
  const payload: TokenPayload = {
    ...input,
    issuedAt: now,
    expiresAt: now + TOKEN_TTL_MS,
  }
  const json = JSON.stringify(payload)
  const encoded = b64url(json)
  const sig = sign(encoded)
  return `${encoded}.${sig}`
}

export type TokenValidationResult =
  | { ok: true; payload: TokenPayload }
  | { ok: false; reason: "MALFORMED" | "TAMPERED" | "EXPIRED" }

/**
 * Valide un token en isolation (signature + expiry). Ne vérifie PAS ici
 * qu'il correspond au Hotel/Room demandés dans la requête BookingCreation —
 * ça, c'est `matchesBookingContext` juste en dessous (permet de distinguer
 * "token invalide" de "token valide mais pour un autre hôtel").
 */
export function validateToken(token: string): TokenValidationResult {
  const parts = token.split(".")
  if (parts.length !== 2) return { ok: false, reason: "MALFORMED" }
  const [encoded, sig] = parts as [string, string]
  const expectedSig = sign(encoded)
  if (sig !== expectedSig) return { ok: false, reason: "TAMPERED" }
  let payload: TokenPayload
  try {
    const json = Buffer.from(
      encoded.replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    ).toString("utf-8")
    payload = JSON.parse(json) as TokenPayload
  } catch {
    return { ok: false, reason: "MALFORMED" }
  }
  if (typeof payload.expiresAt !== "number" || Date.now() > payload.expiresAt) {
    return { ok: false, reason: "EXPIRED" }
  }
  return { ok: true, payload }
}

/** Le token doit correspondre au Hotel/City envoyés dans BookingCreation — sinon "room from another search". */
export function matchesBookingContext(
  payload: TokenPayload,
  ctx: { hotelId: number; cityId: number },
): boolean {
  return payload.hotelId === ctx.hotelId && payload.cityId === ctx.cityId
}
