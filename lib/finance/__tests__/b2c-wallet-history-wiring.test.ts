/**
 * B2C-WALLET-HISTORY-01 — invariants statiques
 *
 * Vérifie le câblage complet de l'historique wallet B2C :
 *   lib/finance/customer-wallet.ts → getCustomerWalletTransactions
 *   components/compte/wallet-transaction-list.tsx → WalletTransactionList
 *   app/(public)/[locale]/compte/wallet/page.tsx → intégration
 *
 * Invariants :
 * 1. getCustomerWalletTransactions exportée depuis customer-wallet.ts
 * 2. WalletTransaction interface exportée
 * 3. Query innerJoin walletAccounts + walletLedger
 * 4. Filtre customerId dans la query
 * 5. orderBy + desc(walletLedger.createdAt) — ordre DESC
 * 6. limit paramètre de la fonction
 * 7. withSystemContext utilisé (bypass RLS)
 * 8. WalletTransactionList exportée depuis le composant
 * 9. Composant attend prop transactions + locale
 * 10. Page wallet importe getCustomerWalletTransactions
 * 11. Page wallet importe WalletTransactionList
 * 12. Page wallet passe customerId à getCustomerWalletTransactions
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()

const walletSrc = readFileSync(
  join(ROOT, "lib/finance/customer-wallet.ts"),
  "utf8",
)
const componentSrc = readFileSync(
  join(ROOT, "components/compte/wallet-transaction-list.tsx"),
  "utf8",
)
const pageSrc = readFileSync(
  join(ROOT, "app/(public)/[locale]/compte/wallet/page.tsx"),
  "utf8",
)

// ─── 1. Fonction exportée ────────────────────────────────────────────────────

test("B2C-WALLET-HISTORY-01: getCustomerWalletTransactions exportée", () => {
  assert.match(
    walletSrc,
    /export async function getCustomerWalletTransactions/,
  )
})

// ─── 2. Interface WalletTransaction exportée ─────────────────────────────────

test("B2C-WALLET-HISTORY-01: WalletTransaction interface exportée", () => {
  assert.match(walletSrc, /export interface WalletTransaction/)
})

// ─── 3. innerJoin walletAccounts + walletLedger ───────────────────────────────

test("B2C-WALLET-HISTORY-01: query innerJoin walletAccounts", () => {
  assert.match(walletSrc, /innerJoin\s*\(\s*walletAccounts/)
})

// ─── 4. Filtre eq(walletAccounts.customerId, customerId) ─────────────────────

test("B2C-WALLET-HISTORY-01: filtre customerId dans la query", () => {
  assert.match(walletSrc, /eq\(walletAccounts\.customerId,\s*customerId\)/)
})

// ─── 5. orderBy + desc createdAt ─────────────────────────────────────────────

test("B2C-WALLET-HISTORY-01: orderBy desc(walletLedger.createdAt)", () => {
  assert.match(walletSrc, /orderBy\(desc\(walletLedger\.createdAt\)\)/)
})

// ─── 6. Paramètre limit ──────────────────────────────────────────────────────

test("B2C-WALLET-HISTORY-01: paramètre limit dans getCustomerWalletTransactions", () => {
  assert.match(walletSrc, /getCustomerWalletTransactions[\s\S]{0,80}limit\s*=\s*\d+/)
})

// ─── 7. withSystemContext (bypass RLS) ───────────────────────────────────────

test("B2C-WALLET-HISTORY-01: withSystemContext utilisé dans getCustomerWalletTransactions", () => {
  const fnStart = walletSrc.indexOf("export async function getCustomerWalletTransactions")
  const fnBlock = walletSrc.slice(fnStart, fnStart + 600)
  assert.match(fnBlock, /withSystemContext/)
})

// ─── 8. WalletTransactionList exportée ───────────────────────────────────────

test("B2C-WALLET-HISTORY-01: WalletTransactionList exportée depuis le composant", () => {
  assert.match(componentSrc, /export (async )?function WalletTransactionList/)
})

// ─── 9. Props transactions + locale ──────────────────────────────────────────

test("B2C-WALLET-HISTORY-01: composant attend props transactions et locale", () => {
  assert.match(componentSrc, /transactions\s*:.*WalletTransaction/)
  assert.match(componentSrc, /locale\s*:\s*string/)
})

// ─── 10. Page importe getCustomerWalletTransactions ──────────────────────────

test("B2C-WALLET-HISTORY-01: page wallet importe getCustomerWalletTransactions", () => {
  assert.match(pageSrc, /getCustomerWalletTransactions/)
})

// ─── 11. Page importe WalletTransactionList ──────────────────────────────────

test("B2C-WALLET-HISTORY-01: page wallet importe WalletTransactionList", () => {
  assert.match(pageSrc, /WalletTransactionList/)
})

// ─── 12. Page passe customerId à getCustomerWalletTransactions ───────────────

test("B2C-WALLET-HISTORY-01: page passe customerId à getCustomerWalletTransactions", () => {
  assert.match(pageSrc, /getCustomerWalletTransactions\(c\.id\)/)
})
