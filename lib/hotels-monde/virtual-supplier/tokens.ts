/**
 * Token d'offre signé du Virtual World Hotel Supplier — même rôle que le
 * Token Vols (lib/vols/virtual-supplier/tokens.ts) : émis à la recherche, à
 * renvoyer tel quel pour réserver. Signé (HMAC) pour pouvoir tester
 * légitimement token invalide/altéré/expiré/d'une autre recherche, jamais
 * un simple id qui "n'existe pas dans une Map".
 */

import { createHmac, randomUUID } from "node:crypto"

const SECRET =
  process.env.VIRTUAL_WORLD_HOTELS_TOKEN_SECRET ?? "virtual-world-hotels-dev-secret-not-for-prod"

const TOKEN_TTL_MS = 15 * 60_000 // 15 min — même fenêtre que les autres Virtual Suppliers

export interface WorldHotelOfferTokenPayload {
  searchId: string
  offerId: string
  destination: string
  checkIn: string
  checkOut: string
  nights: number
  adults: number
  rooms: number
  pricePerNightTnd: number
  totalPriceTnd: number
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

export function issueOfferToken(
  input: Omit<WorldHotelOfferTokenPayload, "issuedAt" | "expiresAt">,
): string {
  const now = Date.now()
  const payload: WorldHotelOfferTokenPayload = { ...input, issuedAt: now, expiresAt: now + TOKEN_TTL_MS }
  const encoded = b64url(JSON.stringify(payload))
  return `${encoded}.${sign(encoded)}`
}

export type TokenValidationResult =
  | { ok: true; payload: WorldHotelOfferTokenPayload }
  | { ok: false; reason: "MALFORMED" | "TAMPERED" | "EXPIRED" }

export function validateOfferToken(token: string): TokenValidationResult {
  const parts = token.split(".")
  if (parts.length !== 2) return { ok: false, reason: "MALFORMED" }
  const [encoded, sig] = parts as [string, string]
  if (sig !== sign(encoded)) return { ok: false, reason: "TAMPERED" }
  let payload: WorldHotelOfferTokenPayload
  try {
    const json = Buffer.from(encoded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8")
    payload = JSON.parse(json) as WorldHotelOfferTokenPayload
  } catch {
    return { ok: false, reason: "MALFORMED" }
  }
  if (typeof payload.expiresAt !== "number" || Date.now() > payload.expiresAt) {
    return { ok: false, reason: "EXPIRED" }
  }
  return { ok: true, payload }
}
