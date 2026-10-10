/**
 * RECHARGE-WIRING-01 — invariants statiques sur lib/finance/recharge-actions.ts
 * (demande + validation + rejet de recharge wallet B2B).
 *
 * Invariants protégés :
 *
 * 1. SUPER_ADMIN ONLY — validateRechargeRequest / rejectRechargeRequest sont
 *    protégés par assertSuperAdminSession() ; isSuperAdmin vérifié (jamais
 *    juste "authentifié").
 *
 * 2. agencyId depuis session — submitRechargeRequest et initiateOnlineRecharge
 *    résolvent agencyId depuis resolveSessionContext(), jamais depuis le
 *    client input (prévient l'usurpation d'agencyId entre agences).
 *
 * 3. FOR UPDATE lock — verrou exclusif dans validateRechargeRequest ET
 *    rejectRechargeRequest avant toute écriture financière (anti
 *    double-validation concurrente).
 *
 * 4. REQUEST_ALREADY_PROCESSED guard — après le FOR UPDATE, le statut est
 *    re-vérifié : si !=="pending", throw REQUEST_ALREADY_PROCESSED (jamais
 *    un double crédit ou double rejet).
 *
 * 5. agencyId:null + isSuperAdmin:true dans withTenantContext — cross-agence :
 *    super_admin valide la recharge d'une agence arbitraire (pas seulement
 *    la sienne). Les deux chemins (validate + reject) utilisent agencyId:null.
 *
 * 6. creditRechargeRequest dans la même transaction — crédit wallet appelé
 *    DANS le withTenantContext de validateRechargeRequest (jamais hors
 *    transaction).
 *
 * 7. Inngest best-effort hors transaction — sendEvent("wallet/credited") est
 *    appelé APRÈS la transaction avec .catch(() => {}) (fire-and-forget).
 *
 * 8. INSERT avant PSP (initiateOnlineRecharge) — walletRechargeRequests
 *    inséré AVANT l'appel Paymee createPayment (idempotence : jamais de
 *    crédit orphelin si le PSP échoue).
 *
 * Pattern readFileSync — même discipline que lib/cars/__tests__/
 * car-voucher-wiring.test.ts.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const src = readFileSync(join(ROOT, "lib/finance/recharge-actions.ts"), "utf8")

// ─── Invariant 1 : super_admin guard ─────────────────────────────────────────

test("RECHARGE-WIRING-01 : assertSuperAdminSession() utilisé par validateRechargeRequest (jamais juste authentifié)", () => {
  assert.match(src, /assertSuperAdminSession\s*\(\s*\)/)
})

test("RECHARGE-WIRING-01 : isSuperAdmin vérifié dans assertSuperAdminSession (pas seulement session.ok)", () => {
  assert.match(src, /isSuperAdmin/)
  assert.match(src, /Accès refusé.*super_admin/)
})

// ─── Invariant 2 : agencyId depuis session ────────────────────────────────────

test("RECHARGE-WIRING-01 : agencyId résolu depuis resolveSessionContext() — jamais depuis le client input", () => {
  assert.match(src, /resolveSessionContext\s*\(\s*\)/)
  assert.match(src, /agencyId\s*=\s*session\.agencyId/)
})

test("RECHARGE-WIRING-01 : commentaire explicite — agencyId jamais accepté depuis le client (usurpation)", () => {
  assert.match(src, /Ne pas accepter ces valeurs depuis le client/)
})

// ─── Invariant 3 : FOR UPDATE lock ───────────────────────────────────────────

test("RECHARGE-WIRING-01 : FOR UPDATE dans validateRechargeRequest (anti double-validation)", () => {
  assert.match(src, /\.for\s*\(\s*["']update["']\s*\)/)
})

test("RECHARGE-WIRING-01 : FOR UPDATE dans rejectRechargeRequest aussi (deux chemins verrouillés)", () => {
  // Au moins deux occurrences de .for("update")
  const occurrences = src.match(/\.for\s*\(\s*["']update["']\s*\)/g)
  assert.ok(
    occurrences !== null && occurrences.length >= 2,
    "FOR UPDATE doit apparaître au moins 2 fois (validate + reject)",
  )
})

// ─── Invariant 4 : REQUEST_ALREADY_PROCESSED ─────────────────────────────────

test("RECHARGE-WIRING-01 : REQUEST_ALREADY_PROCESSED — throw si statut !== pending après le verrou", () => {
  assert.match(src, /REQUEST_ALREADY_PROCESSED/)
  assert.match(src, /request\.status\s*!==\s*["']pending["']/)
  // La vérification de statut doit précéder le throw REQUEST_ALREADY_PROCESSED
  const statusCheckIdx = src.indexOf('request.status !== "pending"')
  const alreadyProcessedIdx = src.indexOf("REQUEST_ALREADY_PROCESSED")
  assert.ok(statusCheckIdx > 0, 'request.status !== "pending" doit exister')
  assert.ok(alreadyProcessedIdx > 0, "REQUEST_ALREADY_PROCESSED doit exister")
  assert.ok(
    statusCheckIdx < alreadyProcessedIdx,
    "status check doit précéder REQUEST_ALREADY_PROCESSED",
  )
})

// ─── Invariant 5 : agencyId:null + isSuperAdmin:true dans withTenantContext ───

test("RECHARGE-WIRING-01 : agencyId:null + isSuperAdmin:true dans withTenantContext (cross-agence validate)", () => {
  assert.match(src, /agencyId:\s*null[\s\S]{0,100}isSuperAdmin:\s*true/)
})

// ─── Invariant 6 : creditRechargeRequest dans la transaction ─────────────────

test("RECHARGE-WIRING-01 : creditRechargeRequest appelé dans withTenantContext (même transaction)", () => {
  assert.match(src, /creditRechargeRequest\s*\(/)
  // creditRechargeRequest est importé depuis wallet-credit
  assert.match(src, /creditRechargeRequest.*from.*wallet-credit/)
})

test("RECHARGE-WIRING-01 : creditRechargeRequest reçoit tx (jamais appelé hors transaction)", () => {
  // Le premier argument est tx (la transaction Drizzle)
  assert.match(src, /creditRechargeRequest\s*\(\s*tx\s*,/)
})

// ─── Invariant 7 : sendEvent best-effort hors transaction ────────────────────

test('RECHARGE-WIRING-01 : sendEvent("wallet/credited") hors transaction avec .catch() fire-and-forget', () => {
  assert.match(src, /sendEvent\s*\(\s*["']wallet\/credited["']/)
  assert.match(src, /\.catch\s*\(\s*\(\s*\)\s*=>/)
})

// ─── Invariant 8 : INSERT avant PSP (initiateOnlineRecharge) ─────────────────

test("RECHARGE-WIRING-01 : INSERT walletRechargeRequests avant createPayment PSP (idempotence — jamais crédit orphelin)", () => {
  assert.match(src, /insert\s*\(\s*walletRechargeRequests\s*\)/)
  assert.match(src, /createPayment\s*\(\s*\{/)
  // L'INSERT doit précéder l'appel PSP
  const insertIdx = src.indexOf("insert(walletRechargeRequests)")
  // initiateOnlineRecharge insère à la deuxième occurrence
  const secondInsertIdx = src.indexOf(
    "insert(walletRechargeRequests)",
    insertIdx + 1,
  )
  const createPaymentIdx = src.indexOf("createPayment({")
  const effectiveInsertIdx = secondInsertIdx > 0 ? secondInsertIdx : insertIdx
  assert.ok(
    effectiveInsertIdx > 0,
    "insert(walletRechargeRequests) doit exister",
  )
  assert.ok(createPaymentIdx > 0, "createPayment({ doit exister")
  assert.ok(
    effectiveInsertIdx < createPaymentIdx,
    "INSERT walletRechargeRequests doit précéder createPayment",
  )
})
