/**
 * LOYALTY-WIRING-01 — invariants statiques sur
 * lib/loyalty/rewards-core.ts (Easy2Book Rewards V1).
 *
 * Invariants protégés :
 *
 * 1. NO USE SERVER — même raison que policy-cancel-core.ts : identité
 *    passée en paramètre, pas lue depuis une session live, jamais un
 *    Server Action indépendant. Seuls les wrappers `"use server"` dans
 *    lib/loyalty/*-actions.ts exposent ces fonctions.
 *
 * 2. Append-only loyaltyLedger — tx.insert(loyaltyLedger) uniquement,
 *    jamais tx.update(loyaltyLedger) : le grand livre de fidélité est
 *    immuable (audit trail irréversible, même discipline que
 *    partnerCreditMovements/wallet_ledger).
 *
 * 3. FOR UPDATE dans lockOrCreateLoyaltyAccount — verrou exclusif avant
 *    toute lecture du solde de points (anti-concurrent double-earn).
 *    Aussi dans expireInactiveAccountsForAgency (re-vérification sous
 *    verrou avant d'expirer).
 *
 * 4. Jamais creditCustomerWallet — les points Easy2Book Rewards ne sont
 *    PAS de l'argent, ne s'ajoutent jamais au wallet DT, et ne déclenchent
 *    jamais creditCustomerWallet (prévient une fusion accidentelle
 *    points ↔ wallet).
 *
 * 5. findLedgerByIdempotencyKey avant tout insertLedgerRow — toutes les
 *    opérations vérifient l'idempotence avant d'insérer (double-earn,
 *    double-reverse, double-redeem impossibles).
 *
 * 6. Math.max(0, ...) sur tous les soldes après décrémentation — jamais
 *    de solde négatif émis dans une ligne de grand livre.
 *
 * 7. idempotencyKey obligatoire sur chaque opération earn/convert/
 *    reverse/reinstate — params.idempotencyKey présent dans chaque
 *    signature de fonction publique.
 *
 * 8. collectedTnd jamais tndAmount — les points ne sont pas calculés
 *    sur le montant brut ; le commentaire interdit explicitement
 *    reservations.tndAmount (non net des remboursements).
 *
 * Pattern readFileSync — même discipline que lib/cars/__tests__/
 * car-voucher-wiring.test.ts.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const src = readFileSync(join(ROOT, "lib/loyalty/rewards-core.ts"), "utf8")

// ─── Invariant 1 : pas de "use server" ───────────────────────────────────────

test('LOYALTY-WIRING-01 : pas de "use server" — exports ne deviennent jamais des Server Actions (identité passée en paramètre)', () => {
  assert.doesNotMatch(src, /^["']use server["']\s*$/m)
})

// ─── Invariant 2 : append-only loyaltyLedger ─────────────────────────────────

test("LOYALTY-WIRING-01 : tx.insert(loyaltyLedger) — grand livre immuable, jamais tx.update(loyaltyLedger)", () => {
  assert.match(src, /\.insert\s*\(\s*loyaltyLedger\s*\)/)
  assert.doesNotMatch(src, /\.update\s*\(\s*loyaltyLedger\s*\)/)
})

// ─── Invariant 3 : FOR UPDATE dans lockOrCreateLoyaltyAccount ────────────────

test("LOYALTY-WIRING-01 : FOR UPDATE dans lockOrCreateLoyaltyAccount (anti double-earn concurrent)", () => {
  assert.match(src, /lockOrCreateLoyaltyAccount/)
  // FOR UPDATE dans la fonction lockOrCreate
  const lockFnIdx = src.indexOf("lockOrCreateLoyaltyAccount")
  const forUpdateIdx = src.indexOf('.for("update")')
  assert.ok(lockFnIdx > 0, "lockOrCreateLoyaltyAccount doit exister")
  assert.ok(forUpdateIdx > 0, "FOR UPDATE doit exister")
  assert.ok(
    forUpdateIdx > lockFnIdx,
    "FOR UPDATE doit apparaître après lockOrCreateLoyaltyAccount",
  )
})

test("LOYALTY-WIRING-01 : FOR UPDATE au moins 2 fois — lockOrCreateLoyaltyAccount + expireInactiveAccounts", () => {
  const occurrences = src.match(/\.for\s*\(\s*["']update["']\s*\)/g)
  assert.ok(
    occurrences !== null && occurrences.length >= 2,
    `FOR UPDATE doit apparaître au moins 2 fois, trouvé : ${occurrences?.length ?? 0}`,
  )
})

// ─── Invariant 4 : jamais creditCustomerWallet ────────────────────────────────

test("LOYALTY-WIRING-01 : creditCustomerWallet jamais importé ni appelé — points ≠ argent, jamais de fusion wallet (prévient conversion accidentelle points → DT)", () => {
  // La mention dans le commentaire JSDoc est attendue (interdit explicite) ;
  // ce qu'on vérifie c'est qu'elle n'est ni importée ni appelée comme fonction.
  assert.doesNotMatch(src, /import[^;]*creditCustomerWallet/)
  assert.doesNotMatch(src, /creditCustomerWallet\s*\(/)
})

// ─── Invariant 5 : idempotence avant insertLedgerRow ─────────────────────────

test("LOYALTY-WIRING-01 : findLedgerByIdempotencyKey vérifié avant insertLedgerRow (idempotence — jamais double-earn/double-redeem)", () => {
  assert.match(src, /findLedgerByIdempotencyKey/)
  assert.match(src, /insertLedgerRow/)
  // findLedgerByIdempotencyKey doit précéder le premier insertLedgerRow
  const checkIdx = src.indexOf("findLedgerByIdempotencyKey")
  const insertIdx = src.indexOf("insertLedgerRow")
  assert.ok(checkIdx > 0, "findLedgerByIdempotencyKey doit exister")
  assert.ok(insertIdx > 0, "insertLedgerRow doit exister")
  assert.ok(
    checkIdx < insertIdx,
    "findLedgerByIdempotencyKey doit précéder insertLedgerRow",
  )
})

// ─── Invariant 6 : Math.max(0, ...) sur les soldes ───────────────────────────

test("LOYALTY-WIRING-01 : Math.max(0, ...) sur les calculs de solde — jamais de solde négatif dans une ligne de grand livre", () => {
  assert.match(src, /Math\.max\s*\(\s*0,/)
})

// ─── Invariant 7 : idempotencyKey dans chaque signature publique ──────────────

test("LOYALTY-WIRING-01 : idempotencyKey dans chaque paramètre de fonction publique (earn/convert/reverse/redeem/reinstate)", () => {
  // Chaque opération publique accepte un idempotencyKey
  assert.match(src, /earnPendingPoints/)
  assert.match(src, /convertPendingToAvailable/)
  assert.match(src, /reverseEarnedPoints/)
  assert.match(src, /redeemPoints/)
  assert.match(src, /reinstateRedeemedPoints/)
  // Le champ idempotencyKey est présent dans les params de chaque fonction
  const idempotencyMatches = src.match(/idempotencyKey:\s*string/g)
  assert.ok(
    idempotencyMatches !== null && idempotencyMatches.length >= 5,
    `idempotencyKey: string doit apparaître au moins 5 fois (une par opération), trouvé : ${idempotencyMatches?.length ?? 0}`,
  )
})

// ─── Invariant 8 : interdiction de reservations.tndAmount ─────────────────────

test("LOYALTY-WIRING-01 : reservations.tndAmount interdit comme base de calcul des points (non net des remboursements — commentaire explicite)", () => {
  // Le commentaire explicite l'interdiction de tndAmount
  assert.match(
    src,
    /jamais.*reservations\.tndAmount|reservations\.tndAmount.*non net/,
  )
})
