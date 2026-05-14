/**
 * Stockage du brouillon de réservation : encode/décode dans un token
 * base64url passé en query string `?d=`.
 *
 * Avantages : 100 % stateless, reload-safe, URL partageable, pas de stockage
 * server-side, compatible Server Components + Edge Runtime.
 *
 * Limitations : taille max ~2 KB (l'URL devient lourde au-delà). Pour des
 * brouillons riches on basculerait sur un cookie HttpOnly ou un draft
 * en BDD ; cela suffit pour notre tunnel hôtel/vol/séjour.
 */

import type { BookingDraft, TravelerInput } from "./schemas"

export type DraftPayload = {
  draft: BookingDraft
  traveler?: TravelerInput
}

function b64urlEncode(buf: Uint8Array | string): string {
  const u8 = typeof buf === "string" ? new TextEncoder().encode(buf) : buf
  let s = ""
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i])
  const b64 =
    typeof btoa !== "undefined" ? btoa(s) : Buffer.from(u8).toString("base64")
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

function b64urlDecode(token: string): string {
  const b64 =
    token.replace(/-/g, "+").replace(/_/g, "/") +
    "===".slice(0, (4 - (token.length % 4)) % 4)
  if (typeof atob !== "undefined") {
    const binary = atob(b64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new TextDecoder().decode(bytes)
  }
  return Buffer.from(b64, "base64").toString("utf-8")
}

export function encodeDraft(payload: DraftPayload): string {
  return b64urlEncode(JSON.stringify(payload))
}

export function decodeDraft(
  token: string | undefined | null,
): DraftPayload | null {
  if (!token) return null
  try {
    const json = b64urlDecode(token)
    const parsed = JSON.parse(json) as DraftPayload
    if (!parsed || typeof parsed !== "object" || !parsed.draft) return null
    return parsed
  } catch {
    return null
  }
}
