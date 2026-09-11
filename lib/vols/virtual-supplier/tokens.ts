/**
 * Token d'offre signé du Virtual Flight Supplier — même rôle que le Token
 * myGo (lib/mygo/virtual-supplier/tokens.ts) : émis à la recherche, à
 * renvoyer tel quel pour réserver. Signé (HMAC) pour pouvoir tester
 * légitimement token invalide/altéré/expiré/d'une autre recherche, jamais
 * un simple id qui "n'existe pas dans une Map".
 */

import { createHmac, randomUUID } from "node:crypto"

const SECRET =
  process.env.VIRTUAL_FLIGHTS_TOKEN_SECRET ?? "virtual-flights-dev-secret-not-for-prod"

const TOKEN_TTL_MS = 15 * 60_000 // 15 min — même fenêtre que le Virtual MyGo Supplier

export interface FlightOfferTokenPayload {
  searchId: string
  offerId: string
  origin: string
  destination: string
  departureDate: string
  returnDate?: string
  adults: number
  children: number
  cabin: string
  priceTnd: number
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
  input: Omit<FlightOfferTokenPayload, "issuedAt" | "expiresAt">,
): string {
  const now = Date.now()
  const payload: FlightOfferTokenPayload = { ...input, issuedAt: now, expiresAt: now + TOKEN_TTL_MS }
  const encoded = b64url(JSON.stringify(payload))
  return `${encoded}.${sign(encoded)}`
}

export type TokenValidationResult =
  | { ok: true; payload: FlightOfferTokenPayload }
  | { ok: false; reason: "MALFORMED" | "TAMPERED" | "EXPIRED" }

export function validateOfferToken(token: string): TokenValidationResult {
  const parts = token.split(".")
  if (parts.length !== 2) return { ok: false, reason: "MALFORMED" }
  const [encoded, sig] = parts as [string, string]
  if (sig !== sign(encoded)) return { ok: false, reason: "TAMPERED" }
  let payload: FlightOfferTokenPayload
  try {
    const json = Buffer.from(encoded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8")
    payload = JSON.parse(json) as FlightOfferTokenPayload
  } catch {
    return { ok: false, reason: "MALFORMED" }
  }
  if (typeof payload.expiresAt !== "number" || Date.now() > payload.expiresAt) {
    return { ok: false, reason: "EXPIRED" }
  }
  return { ok: true, payload }
}
