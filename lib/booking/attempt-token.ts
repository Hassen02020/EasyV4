/**
 * GUEST-IDEMPOTENCY-01 — socle du jeton de tentative de réservation (B2C invité).
 *
 * Un jeton est émis par le SERVEUR, une fois par instance de formulaire.
 * Il ne contient aucune donnée client : seulement {module, organisation,
 * identifiant aléatoire 128 bits, expiration}, signé (HMAC-SHA256).
 *
 * Invariant de niveau 1 (tentative) : la clé d'idempotence dérive du jeton
 * SEUL (jamais de l'identité saisie) → l'index unique partiel
 * `reservations_guest_idempotency_uniq` garantit « un jeton = au plus une
 * réservation », quoi qu'on modifie dans le formulaire.
 *
 * L'identité et la requête sont portées par deux empreintes HMAC distinctes
 * (stockées dans `provider_payload`) et COMPARÉES au rejeu : un jeton rejoué
 * avec une autre identité ou un autre contenu est refusé (rien n'est créé,
 * rien n'est renvoyé).
 *
 * Le secret est dérivé (HKDF) de PRICE_TOKEN_SECRET avec une étiquette
 * dédiée : un jeton de prix ne peut jamais être pris pour un jeton de
 * tentative, et inversement. Ce module ne modifie pas price-token.ts.
 */

import { createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto"

export type AttemptModule = "transfer"

/** TTL du jeton — valeur PROPOSÉE (2 h), à confirmer par la direction. */
export const ATTEMPT_TOKEN_TTL_MS = 2 * 60 * 60 * 1000

/**
 * Fenêtre du contrôle de contenu (niveau 2) — valeur PROPOSÉE (24 h),
 * à confirmer par la direction.
 */
export const DUPLICATE_CONTENT_WINDOW_MS = 24 * 60 * 60 * 1000

export type AttemptTokenMode = "off" | "dual" | "enforce"

/**
 * M0 `off` (défaut, comportement historique) · M1 `dual` (les deux chemins,
 * jetons émis et honorés, contrôle de contenu actif) · M2 `enforce` (jeton
 * obligatoire pour créer ; le chemin historique ne fait que rejouer).
 * Toute valeur inconnue retombe sur `off` (fail-safe : comportement actuel).
 */
export function getAttemptTokenMode(
  env: Record<string, string | undefined> = process.env,
): AttemptTokenMode {
  const v = (env.GUEST_ATTEMPT_TOKEN_MODE ?? "").trim().toLowerCase()
  return v === "dual" || v === "enforce" ? v : "off"
}

const DEV_SECRET = "price-token-dev-secret-not-for-prod"

function rootSecret(): string {
  const s = process.env.PRICE_TOKEN_SECRET
  if (process.env.NODE_ENV === "production" && (!s || s === DEV_SECRET)) {
    throw new Error(
      "PRICE_TOKEN_SECRET manquant ou valeur dev détectée en production (jeton de tentative).",
    )
  }
  return s ?? DEV_SECRET
}

function derive(label: string): Buffer {
  return Buffer.from(
    hkdfSync("sha256", rootSecret(), "", `e2b:guest-attempt:${label}`, 32),
  )
}

function hmac(label: string, data: string): Buffer {
  return createHmac("sha256", derive(label)).update(data).digest()
}

/** Émet un jeton de tentative lié à (module, organisation). */
export function issueAttemptToken(
  module: AttemptModule,
  orgId: string,
  now: number = Date.now(),
): string {
  const payload = Buffer.from(
    JSON.stringify({
      m: module,
      o: orgId,
      i: randomBytes(16).toString("hex"),
      x: now + ATTEMPT_TOKEN_TTL_MS,
    }),
    "utf8",
  ).toString("base64url")
  return `${payload}.${hmac("sig", payload).toString("base64url")}`
}

export type VerifyAttemptTokenResult =
  | { ok: true; attemptId: string; key: string }
  | {
      ok: false
      reason: "malformed" | "bad_signature" | "expired" | "wrong_scope"
    }

/** Vérifie signature, portée (module + organisation) et expiration. */
export function verifyAttemptToken(
  token: unknown,
  module: AttemptModule,
  orgId: string,
  now: number = Date.now(),
): VerifyAttemptTokenResult {
  if (typeof token !== "string" || token.length > 512) {
    return { ok: false, reason: "malformed" }
  }
  const parts = token.split(".")
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, reason: "malformed" }
  }
  const [payloadB64, sigB64] = parts
  const expected = hmac("sig", payloadB64)
  const given = Buffer.from(sigB64, "base64url")
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: "bad_signature" }
  }
  let p: { m?: unknown; o?: unknown; i?: unknown; x?: unknown }
  try {
    p = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"))
  } catch {
    return { ok: false, reason: "malformed" }
  }
  if (
    typeof p.m !== "string" ||
    typeof p.o !== "string" ||
    typeof p.i !== "string" ||
    typeof p.x !== "number"
  ) {
    return { ok: false, reason: "malformed" }
  }
  if (p.m !== module || p.o !== orgId) {
    return { ok: false, reason: "wrong_scope" }
  }
  if (p.x < now) return { ok: false, reason: "expired" }
  // Clé d'idempotence : dérivée du jeton seul (identifiant aléatoire),
  // jamais de l'identité saisie. 64 hex, opaque, non devinable.
  const key = hmac("key", `${p.m}|${p.o}|${p.i}`).toString("hex")
  return { ok: true, attemptId: p.i, key }
}

/* -------------------------------------------------------------------------- */
/* Empreintes (HMAC) — identité et requête                                    */
/* -------------------------------------------------------------------------- */

function normEmail(v: string | null | undefined): string {
  return (v ?? "").trim().toLowerCase()
}
function normPhone(v: string | null | undefined): string {
  return (v ?? "").replace(/\D+/g, "")
}

/** Identité = e-mail + téléphone du voyageur principal (décision D15). */
export function fingerprintIdentity(
  module: AttemptModule,
  orgId: string,
  identity: { email?: string | null; phone?: string | null },
): string {
  return hmac(
    "identity",
    JSON.stringify([
      module,
      orgId,
      normEmail(identity.email),
      normPhone(identity.phone),
    ]),
  ).toString("hex")
}

/** Requête = identité + contenu (tableau ordonné : stable et sans ambiguïté). */
export function fingerprintRequest(
  module: AttemptModule,
  orgId: string,
  identityFp: string,
  content: ReadonlyArray<string | number | null | undefined>,
): string {
  return hmac(
    "request",
    JSON.stringify([
      module,
      orgId,
      identityFp,
      ...content.map((c) => c ?? null),
    ]),
  ).toString("hex")
}

export type ReplayDecision = "return_existing" | "mismatch"

/**
 * Rejeu d'un jeton déjà consommé : même identité ET même requête → on
 * renvoie la réservation gagnante ; sinon refus (aucune donnée renvoyée).
 */
export function decideReplay(
  stored: { identityFp?: unknown; requestFp?: unknown },
  current: { identityFp: string; requestFp: string },
): ReplayDecision {
  return stored.identityFp === current.identityFp &&
    stored.requestFp === current.requestFp
    ? "return_existing"
    : "mismatch"
}
