/**
 * WALLET-BOOTSTRAP-01 — invariants statiques
 *
 * Vérifie le câblage complet du bootstrap wallet B2C :
 *   createCustomerProfile → resolveOrCreateLinkedCustomer → customers row
 *   wallet/page.tsx → WalletProfileSetupForm (plus de message "Effectuez d'abord une réservation")
 *
 * Invariants :
 * T1. createCustomerProfile exportée depuis b2c-topup-actions.ts
 * T2. createCustomerProfile réutilise resolveOrCreateLinkedCustomer (REUSE pattern)
 * T3. agencyId sourcé de guestTenantContext (jamais du client)
 * T4. user.email sourcé de supabase.auth.getUser (jamais du client)
 * T5. revalidatePath appelé après succès (cache invalidé)
 * T6. wallet/page.tsx n'affiche plus le message bloquant d'erreur "Effectuez d'abord une réservation"
 * T7. wallet/page.tsx importe WalletProfileSetupForm
 * T8. WalletProfileSetupForm appelle createCustomerProfile
 * T9. WalletProfileSetupForm appelle router.refresh() après succès
 * T10. createCustomerProfile ne touche pas au ledger, wallet_accounts, payments
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()

const topupActionsSrc = readFileSync(
  join(ROOT, "lib/finance/b2c-topup-actions.ts"),
  "utf8",
)
const walletPageSrc = readFileSync(
  join(ROOT, "app/(public)/[locale]/compte/wallet/page.tsx"),
  "utf8",
)
const profileFormSrc = readFileSync(
  join(ROOT, "components/compte/wallet-profile-setup-form.tsx"),
  "utf8",
)

// ─── T1. createCustomerProfile exportée ──────────────────────────────────────

test("WALLET-BOOTSTRAP-01 T1: createCustomerProfile est exportée depuis b2c-topup-actions.ts", () => {
  assert.match(
    topupActionsSrc,
    /export\s+async\s+function\s+createCustomerProfile/,
  )
})

// ─── T2. REUSE resolveOrCreateLinkedCustomer ─────────────────────────────────

test("WALLET-BOOTSTRAP-01 T2: createCustomerProfile réutilise resolveOrCreateLinkedCustomer", () => {
  assert.match(topupActionsSrc, /resolveOrCreateLinkedCustomer/)
  assert.match(
    topupActionsSrc,
    /import.*resolveOrCreateLinkedCustomer.*customer-identity/,
  )
})

// ─── T3. agencyId depuis guestTenantContext (jamais client-fourni) ────────────

test("WALLET-BOOTSTRAP-01 T3: agencyId sourcé de guestTenantContext dans createCustomerProfile", () => {
  const fn = topupActionsSrc.slice(
    topupActionsSrc.indexOf("export async function createCustomerProfile"),
  )
  assert.match(fn, /guestTenantContext/)
  assert.match(fn, /tenant\.agencyId/)
})

// ─── T4. user.email depuis supabase.auth.getUser (jamais client-fourni) ───────

test("WALLET-BOOTSTRAP-01 T4: user.email résolu via supabase.auth.getUser dans createCustomerProfile", () => {
  const fn = topupActionsSrc.slice(
    topupActionsSrc.indexOf("export async function createCustomerProfile"),
  )
  assert.match(fn, /supabase\.auth\.getUser/)
  assert.match(fn, /user\.email/)
})

// ─── T5. revalidatePath appelé après succès ───────────────────────────────────

test("WALLET-BOOTSTRAP-01 T5: revalidatePath appelé dans createCustomerProfile", () => {
  assert.match(topupActionsSrc, /revalidatePath/)
  assert.match(topupActionsSrc, /from "next\/cache"/)
})

// ─── T6. Ancien message bloquant absent de wallet/page.tsx ───────────────────

test("WALLET-BOOTSTRAP-01 T6: wallet/page.tsx ne contient plus le message bloquant", () => {
  assert.doesNotMatch(walletPageSrc, /Effectuez d.abord une réservation/)
  assert.doesNotMatch(walletPageSrc, /Profil client introuvable/)
})

// ─── T7. wallet/page.tsx importe WalletProfileSetupForm ──────────────────────

test("WALLET-BOOTSTRAP-01 T7: wallet/page.tsx importe WalletProfileSetupForm", () => {
  assert.match(walletPageSrc, /WalletProfileSetupForm/)
  assert.match(walletPageSrc, /wallet-profile-setup-form/)
})

// ─── T8. WalletProfileSetupForm appelle createCustomerProfile ─────────────────

test("WALLET-BOOTSTRAP-01 T8: WalletProfileSetupForm appelle createCustomerProfile", () => {
  assert.match(profileFormSrc, /createCustomerProfile/)
  assert.match(
    profileFormSrc,
    /import.*createCustomerProfile.*b2c-topup-actions/,
  )
})

// ─── T9. router.refresh() après succès ───────────────────────────────────────

test("WALLET-BOOTSTRAP-01 T9: WalletProfileSetupForm appelle router.refresh() après succès", () => {
  assert.match(profileFormSrc, /router\.refresh\(\)/)
  assert.match(profileFormSrc, /useRouter/)
})

// ─── T10. Pas d'écriture ledger/wallet_accounts/payments dans createCustomerProfile

test("WALLET-BOOTSTRAP-01 T10: createCustomerProfile ne touche pas au ledger ni au wallet", () => {
  const fn = topupActionsSrc.slice(
    topupActionsSrc.indexOf("export async function createCustomerProfile"),
  )
  assert.doesNotMatch(fn, /wallet_accounts/)
  assert.doesNotMatch(fn, /wallet_ledger/)
  assert.doesNotMatch(fn, /payments/)
  assert.doesNotMatch(fn, /creditCustomerWallet/)
  assert.doesNotMatch(fn, /debitCustomerWallet/)
})
