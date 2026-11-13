/**
 * DRAFT-PII-URL-01 — le voyageur (nom, email, téléphone, CIN/passeport…) ne
 * transite plus par l'URL du tunnel de réservation : il est conservé dans un
 * cookie HttpOnly chiffré, UN cookie par brouillon (identifiant opaque `t`
 * dans l'URL), pour que deux onglets ne s'écrasent pas.
 *
 * Module pur (aucun accès cookie ici — voir traveler-cookie-actions.ts).
 *
 * Secret : LECTURE SEULE de PRICE_TOKEN_SECRET (déjà exigé en production par
 * lib/booking/price-token.ts, qui n'est pas modifié). Des clés distinctes sont
 * dérivées par HKDF avec un libellé par usage : le secret brut n'est jamais
 * utilisé directement, et une clé ne sert jamais deux usages.
 *  - cookie voyageur : AES-256-GCM, identifiant du brouillon lié en AAD ;
 *  - clé d'idempotence : HMAC-SHA256.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
} from "node:crypto"
import { travelerSchemaWithIdRule, type TravelerInput } from "./schemas"

const DEV_SECRET = "price-token-dev-secret-not-for-prod"

/** Durée de vie d'un brouillon voyageur (cookie + horodatage chiffré). */
export const TRAVELER_COOKIE_TTL_MS = 2 * 60 * 60 * 1000
/** Nombre maximal de brouillons voyageur conservés par navigateur. */
export const TRAVELER_COOKIE_MAX = 3
export const TRAVELER_COOKIE_PREFIX = "e2b_trv_"
const ID_RE = /^[A-Za-z0-9_-]{22}$/

function secret(): string {
  const s = process.env.PRICE_TOKEN_SECRET
  if (process.env.NODE_ENV === "production" && (!s || s === DEV_SECRET)) {
    throw new Error(
      "PRICE_TOKEN_SECRET manquant ou valeur de dev en production",
    )
  }
  return s ?? DEV_SECRET
}

function derive(info: string): Buffer {
  return Buffer.from(hkdfSync("sha256", secret(), "e2b", info, 32))
}

export function newTravelerRef(): string {
  return randomBytes(16).toString("base64url")
}

export function isTravelerRef(v: unknown): v is string {
  return typeof v === "string" && ID_RE.test(v)
}

export function travelerCookieName(ref: string): string {
  if (!isTravelerRef(ref)) throw new Error("référence voyageur invalide")
  return TRAVELER_COOKIE_PREFIX + ref
}

/** Chiffre le voyageur ; l'identifiant du brouillon est lié (AAD). */
export function sealTraveler(
  ref: string,
  traveler: TravelerInput,
  nowMs = Date.now(),
): string {
  if (!isTravelerRef(ref)) throw new Error("référence voyageur invalide")
  const iv = randomBytes(12)
  const c = createCipheriv("aes-256-gcm", derive("e2b:traveler-cookie:v1"), iv)
  c.setAAD(Buffer.from(ref))
  const body = Buffer.concat([
    c.update(
      JSON.stringify({
        v: 1,
        iat: nowMs,
        exp: nowMs + TRAVELER_COOKIE_TTL_MS,
        traveler,
      }),
      "utf8",
    ),
    c.final(),
  ])
  return Buffer.concat([iv, c.getAuthTag(), body]).toString("base64url")
}

export type OpenedTraveler = { traveler: TravelerInput; iat: number }

/** Déchiffre ; `null` si falsifié, d'un autre brouillon, expiré ou invalide. */
export function openTraveler(
  ref: string,
  sealed: string | undefined | null,
  nowMs = Date.now(),
): OpenedTraveler | null {
  if (!isTravelerRef(ref) || !sealed) return null
  try {
    const raw = Buffer.from(sealed, "base64url")
    if (raw.length < 12 + 16 + 1) return null
    const d = createDecipheriv(
      "aes-256-gcm",
      derive("e2b:traveler-cookie:v1"),
      raw.subarray(0, 12),
    )
    d.setAAD(Buffer.from(ref))
    d.setAuthTag(raw.subarray(12, 28))
    const json = Buffer.concat([d.update(raw.subarray(28)), d.final()])
    const p = JSON.parse(json.toString("utf8")) as {
      v?: number
      iat?: number
      exp?: number
      traveler?: unknown
    }
    if (p.v !== 1 || typeof p.iat !== "number" || typeof p.exp !== "number")
      return null
    if (p.exp <= nowMs || p.iat > nowMs + 60_000) return null
    const parsed = travelerSchemaWithIdRule.safeParse(p.traveler)
    return parsed.success ? { traveler: parsed.data, iat: p.iat } : null
  } catch {
    return null
  }
}

/** JSON canonique (clés triées) pour un voyageur. */
export function canonicalTraveler(t: TravelerInput): string {
  const o = t as Record<string, unknown>
  return JSON.stringify(
    Object.fromEntries(
      Object.keys(o)
        .sort()
        .map((k) => [k, o[k]]),
    ),
  )
}

/**
 * Clé d'idempotence d'un paiement invité / B2B : HMAC avec clé dérivée ; le
 * voyageur entre dans le calcul, donc deux clients différents n'ont jamais la
 * même clé. (DRAFT-PII-URL-02 : la formule sha256 de l'ancien ?d= est supprimée.)
 */
export function checkoutIdempotencyKey(input: {
  token: string
  traveler: TravelerInput
  mode: string // moyen de paiement, ou "b2b"
}): string {
  return createHmac("sha256", derive("e2b:guest-idempotency:v1"))
    .update(
      `${input.token}\n${canonicalTraveler(input.traveler)}\n${input.mode}`,
    )
    .digest("hex")
}
