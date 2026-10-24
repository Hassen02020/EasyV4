/**
 * GUEST-CUSTOMER-LINKING-01 — invariants statiques
 *
 * Vérifie le câblage et les règles de sécurité de la liaison
 * guest → compte authentifié au moment du login OTP.
 *
 * T1.  linkGuestCustomerToAuth exportée depuis customer-identity.ts
 * T2.  filtre par agencyId (tenant-scoped)
 * T3.  filtre authUserId IS NULL (refuse d'écraser une liaison existante)
 * T4.  gestion collision (>1 candidat → skip, résultat "collision")
 * T5.  auth/callback importe linkGuestCustomerToAuth
 * T6.  auth/callback appelle guestTenantContext (tenant résolu côté serveur)
 * T7.  auth/callback entoure la liaison dans try/catch (best-effort)
 * T8.  auth/callback log le cas collision (warn, pas throw)
 * T9.  auth/callback ne passe jamais l'email depuis le query string
 * T10. linkGuestCustomerToAuth n'est pas appelée avant exchangeCodeForSession
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()

const identitySrc = readFileSync(
  join(ROOT, "lib/booking/customer-identity.ts"),
  "utf8",
)
const callbackSrc = readFileSync(
  join(ROOT, "app/api/auth/callback/route.ts"),
  "utf8",
)

// ─── T1. linkGuestCustomerToAuth exportée ────────────────────────────────────

test("GUEST-CUSTOMER-LINKING-01 T1: linkGuestCustomerToAuth est exportée depuis customer-identity.ts", () => {
  assert.match(
    identitySrc,
    /export\s+async\s+function\s+linkGuestCustomerToAuth/,
  )
})

// ─── T2. filtre agencyId (tenant-scoped) ─────────────────────────────────────

test("GUEST-CUSTOMER-LINKING-01 T2: linkGuestCustomerToAuth filtre par agencyId", () => {
  const fn = identitySrc.slice(
    identitySrc.indexOf("export async function linkGuestCustomerToAuth"),
    identitySrc.indexOf("export async function resolveOrCreateLinkedCustomer"),
  )
  assert.match(fn, /agencyId/)
  assert.match(fn, /eq\(customers\.agencyId/)
})

// ─── T3. filtre authUserId IS NULL ───────────────────────────────────────────

test("GUEST-CUSTOMER-LINKING-01 T3: linkGuestCustomerToAuth filtre authUserId IS NULL", () => {
  const fn = identitySrc.slice(
    identitySrc.indexOf("export async function linkGuestCustomerToAuth"),
    identitySrc.indexOf("export async function resolveOrCreateLinkedCustomer"),
  )
  assert.match(fn, /isNull\(customers\.authUserId\)/)
})

// ─── T4. gestion collision ────────────────────────────────────────────────────

test("GUEST-CUSTOMER-LINKING-01 T4: linkGuestCustomerToAuth retourne skipped:'collision' si >1 candidat", () => {
  const fn = identitySrc.slice(
    identitySrc.indexOf("export async function linkGuestCustomerToAuth"),
    identitySrc.indexOf("export async function resolveOrCreateLinkedCustomer"),
  )
  assert.match(fn, /collision/)
  assert.match(fn, /candidates\.length\s*>\s*1/)
})

// ─── T5. callback importe linkGuestCustomerToAuth ────────────────────────────

test("GUEST-CUSTOMER-LINKING-01 T5: auth/callback importe linkGuestCustomerToAuth", () => {
  assert.match(callbackSrc, /linkGuestCustomerToAuth/)
  assert.match(callbackSrc, /customer-identity/)
})

// ─── T6. callback résout le tenant côté serveur ──────────────────────────────

test("GUEST-CUSTOMER-LINKING-01 T6: auth/callback appelle guestTenantContext (tenant côté serveur)", () => {
  assert.match(callbackSrc, /guestTenantContext/)
})

// ─── T7. best-effort — try/catch autour de la liaison ────────────────────────

test("GUEST-CUSTOMER-LINKING-01 T7: auth/callback entoure la liaison dans try/catch", () => {
  const afterExchange = callbackSrc.slice(
    callbackSrc.indexOf("exchangeCodeForSession"),
  )
  assert.match(afterExchange, /try\s*\{/)
  assert.match(afterExchange, /catch/)
})

// ─── T8. collision loguée (warn, pas throw) ───────────────────────────────────

test("GUEST-CUSTOMER-LINKING-01 T8: auth/callback log le cas collision sans throw", () => {
  assert.match(callbackSrc, /collision/)
  assert.match(callbackSrc, /logger\.warn/)
  assert.doesNotMatch(
    callbackSrc.slice(callbackSrc.indexOf("collision")),
    /throw/,
  )
})

// ─── T9. email jamais depuis le query string ──────────────────────────────────

test("GUEST-CUSTOMER-LINKING-01 T9: l'email utilisé pour la liaison vient de supabase.auth.getUser, jamais du query string", () => {
  // L'email ne doit pas venir de url.searchParams
  const linkingBlock = callbackSrc.slice(
    callbackSrc.indexOf("linkGuestCustomerToAuth"),
  )
  assert.doesNotMatch(linkingBlock, /searchParams\.get\(["']email["']\)/)
  // L'email provient bien de user.email (résolu par Supabase)
  assert.match(callbackSrc, /user\.email/)
})

// ─── T10. liaison APRÈS exchangeCodeForSession ────────────────────────────────

test("GUEST-CUSTOMER-LINKING-01 T10: linkGuestCustomerToAuth est appelée après exchangeCodeForSession", () => {
  const exchangePos = callbackSrc.indexOf("exchangeCodeForSession")
  // Cherche la première invocation (pas l'import) : "linkGuestCustomerToAuth("
  const callPos = callbackSrc.indexOf("linkGuestCustomerToAuth(")
  assert.ok(
    exchangePos > 0 && callPos > exchangePos,
    "l'appel à linkGuestCustomerToAuth doit apparaître après exchangeCodeForSession dans le source",
  )
})
