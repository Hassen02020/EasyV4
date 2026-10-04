/**
 * Invariants statiques — câblage commission dans les pipelines de réservation.
 *
 * Vérifie sur le code source réel (readFileSync) que :
 *  1. Les deux pipelines (B2B actions.ts, B2C guest-actions.ts) importent
 *     `creditPlatformCommission`.
 *  2. Les deux destructurent `{ commissionAmount }` depuis
 *     `recordReservationFinancials`.
 *  3. `creditPlatformCommission` est appelé avec `publicRef` dans la
 *     description (traçabilité).
 *  4. La migration 0066 ne GRANT pas à `authenticated`
 *     (risque sécurité SECURITY DEFINER éliminé par aa7583b).
 *  5. La migration 0066 possède bien un UNIQUE INDEX sur
 *     `commission_settlements(period_start, period_end)`
 *     (protection double-settlement concurrentiel).
 *  6. `commission-settlement.ts` filtre les entrées non settlées via
 *     `notExists(... commission_settlement_entries ...)` (idempotence
 *     settlement) — et non via un `UPDATE` sur `wallet_ledger`, qui
 *     violerait l'invariant append-only (R4-03, Master Prompt §13.2).
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const actionsSrc = readFileSync(join(ROOT, "lib/booking/actions.ts"), "utf8")
const guestActionsSrc = readFileSync(
  join(ROOT, "lib/booking/guest-actions.ts"),
  "utf8",
)
const migrationSrc = readFileSync(
  join(ROOT, "drizzle/manual/0066_commission_wallet_settlement.sql"),
  "utf8",
)
const settlementSrc = readFileSync(
  join(ROOT, "lib/finance/commission-settlement.ts"),
  "utf8",
)
const financialsSchemaSrc = readFileSync(
  join(ROOT, "lib/db/schema/financials.ts"),
  "utf8",
)
const migration0104Src = readFileSync(
  join(ROOT, "drizzle/manual/0104_settle_fk_integrity.sql"),
  "utf8",
)
const economicEntitlementsSchemaSrc = readFileSync(
  join(ROOT, "lib/db/schema.ts"),
  "utf8",
)
const migration0105Src = readFileSync(
  join(ROOT, "drizzle/manual/0105_econ_entitlements_settlement_fk.sql"),
  "utf8",
)
const migration0106Src = readFileSync(
  join(ROOT, "drizzle/manual/0106_wallet_ledger_fk_account.sql"),
  "utf8",
)
const migration0107Src = readFileSync(
  join(ROOT, "drizzle/manual/0107_wallet_ledger_category_check.sql"),
  "utf8",
)
const customerWalletSrc = readFileSync(
  join(ROOT, "lib/finance/customer-wallet.ts"),
  "utf8",
)
const migration0108Src = readFileSync(
  join(ROOT, "drizzle/manual/0108_agencies_status_check.sql"),
  "utf8",
)
// agencies est défini dans lib/db/schema.ts (même fichier qu'economicEntitlementsSchemaSrc)
const agenciesSchemaSrc = economicEntitlementsSchemaSrc

/* -------------------------------------------------------------------------- */
/* Import wiring                                                                */
/* -------------------------------------------------------------------------- */

test("actions.ts : importe creditPlatformCommission depuis lib/finance/platform-commission", () => {
  assert.match(
    actionsSrc,
    /import\s*\{[^}]*creditPlatformCommission[^}]*\}\s*from\s*["']@\/lib\/finance\/platform-commission["']/,
  )
})

test("guest-actions.ts : importe creditPlatformCommission depuis lib/finance/platform-commission", () => {
  assert.match(
    guestActionsSrc,
    /import\s*\{[^}]*creditPlatformCommission[^}]*\}\s*from\s*["']@\/lib\/finance\/platform-commission["']/,
  )
})

/* -------------------------------------------------------------------------- */
/* Destructuring return value                                                   */
/* -------------------------------------------------------------------------- */

test("actions.ts : destructure { commissionAmount } depuis recordReservationFinancials", () => {
  assert.match(
    actionsSrc,
    /const\s*\{\s*commissionAmount\s*\}\s*=\s*await\s+recordReservationFinancials\(/,
  )
})

test("guest-actions.ts : destructure { commissionAmount } depuis recordReservationFinancials", () => {
  assert.match(
    guestActionsSrc,
    /const\s*\{\s*commissionAmount\s*\}\s*=\s*await\s+recordReservationFinancials\(/,
  )
})

/* -------------------------------------------------------------------------- */
/* Description avec publicRef (traçabilité réservation → wallet ledger)        */
/* -------------------------------------------------------------------------- */

test("actions.ts : creditPlatformCommission description inclut publicRef", () => {
  assert.match(actionsSrc, /description:\s*`[^`]*\$\{publicRef\}[^`]*`/)
})

test("guest-actions.ts : creditPlatformCommission description inclut publicRef", () => {
  assert.match(guestActionsSrc, /description:\s*`[^`]*\$\{publicRef\}[^`]*`/)
})

/* -------------------------------------------------------------------------- */
/* Sécurité migration — GRANT ne cible pas authenticated                        */
/* -------------------------------------------------------------------------- */

test("migration 0066 : GRANT EXECUTE sur credit_platform_commission n'inclut PAS authenticated", () => {
  // Extrait la ligne GRANT pour cette fonction
  const grantMatch = migrationSrc.match(
    /GRANT EXECUTE ON FUNCTION credit_platform_commission[^\n;]+(?:TO[^\n;]+)?/i,
  )
  assert.ok(grantMatch, "La ligne GRANT doit exister")
  assert.equal(
    grantMatch[0].toLowerCase().includes("authenticated"),
    false,
    `GRANT ne doit pas cibler authenticated — trouvé : ${grantMatch[0]}`,
  )
})

/* -------------------------------------------------------------------------- */
/* Concurrence settlement — UNIQUE INDEX période                                */
/* -------------------------------------------------------------------------- */

test("migration 0066 : possède un UNIQUE INDEX sur commission_settlements(period_start, period_end)", () => {
  assert.match(
    migrationSrc,
    /CREATE UNIQUE INDEX IF NOT EXISTS commission_settlements_period_uniq/i,
  )
})

/* -------------------------------------------------------------------------- */
/* Idempotence settlement — filtrage via table append-only dédiée              */
/* -------------------------------------------------------------------------- */

test("commission-settlement.ts : settleCommissions filtre via notExists(commissionSettlementEntries) pour éviter de re-settler", () => {
  assert.match(settlementSrc, /notExists\(/)
  assert.match(settlementSrc, /commissionSettlementEntries/)
})

test("commission-settlement.ts : notSettledFilter(tx) est appliqué aux DEUX sites de requête dans settleCommissions (agrégat ET sélection des entrées)", () => {
  // L'idempotence repose sur deux lectures: COUNT (agrégat) et SELECT (entrées réelles).
  // Si le filtre est absent de l'une, une entrée déjà settlée peut être recomptée
  // ou réinsérée — seule la contrainte DB (UNIQUE walletLedgerId) l'empêche.
  // Les deux doivent être protégées par le filtre pour éviter ce risque applicatif.
  const occurrences = settlementSrc.split("notSettledFilter(tx)").length - 1
  assert.ok(
    occurrences >= 2,
    `notSettledFilter(tx) doit être présent au moins 2 fois dans commission-settlement.ts (agrégat + sélection entrées) — trouvé: ${occurrences}`,
  )
})

test("commission-settlement.ts : n'UPDATE plus jamais walletLedger (append-only, R4-03)", () => {
  assert.doesNotMatch(settlementSrc, /\.update\(walletLedger\)/)
})

test("commission-settlement.ts : markSettlementPaid passe status à 'paid'", () => {
  assert.match(settlementSrc, /status:\s*["']paid["']/)
})

/* -------------------------------------------------------------------------- */
/* Chantier 62 — câblage recordReservationFinancials dans les 7 modules        */
/* manquants (Break 4 : tous les modules sauf hotel n'écrivaient jamais dans   */
/* reservation_financials → Dashboard Marges affichait 0 pour 7/8 modules)    */
/* -------------------------------------------------------------------------- */

// Modules qui appellent recordReservationFinancials DIRECTEMENT
const DIRECT_WIRING_FILES: Array<{ label: string; path: string }> = [
  {
    label: "vols/guest-booking-actions.ts",
    path: "lib/vols/guest-booking-actions.ts",
  },
  {
    label: "transfers/guest-booking-actions.ts",
    path: "lib/transfers/guest-booking-actions.ts",
  },
  { label: "transfers/actions.ts", path: "lib/transfers/actions.ts" },
  {
    label: "activities/guest-booking-actions.ts",
    path: "lib/activities/guest-booking-actions.ts",
  },
  {
    label: "omra/guest-booking-actions.ts",
    path: "lib/omra/guest-booking-actions.ts",
  },
  {
    label: "packages/booking-actions.ts",
    path: "lib/packages/booking-actions.ts",
  },
  {
    label: "cars/guest-booking-actions.ts",
    path: "lib/cars/guest-booking-actions.ts",
  },
  {
    label: "hotels-monde/guest-booking-actions.ts",
    path: "lib/hotels-monde/guest-booking-actions.ts",
  },
]

for (const { label, path } of DIRECT_WIRING_FILES) {
  const src = readFileSync(join(ROOT, path), "utf8")

  test(`Chantier 62 — ${label} : importe recordReservationFinancials`, () => {
    assert.match(
      src,
      /import\s*\{[^}]*recordReservationFinancials[^}]*\}\s*from\s*["']@\/lib\/finance\/reservation-financials["']/,
      `${label} doit importer recordReservationFinancials depuis lib/finance/reservation-financials`,
    )
  })

  test(`Chantier 62 — ${label} : appelle recordReservationFinancials avec reservationId + supplierPriceTnd + salePriceTnd`, () => {
    assert.match(
      src,
      /recordReservationFinancials\(\s*\{/,
      `${label} doit appeler recordReservationFinancials({}...)`,
    )
    assert.match(src, /reservationId/, `${label} : passe reservationId`)
    assert.match(src, /supplierPriceTnd/, `${label} : passe supplierPriceTnd`)
    assert.match(src, /salePriceTnd/, `${label} : passe salePriceTnd`)
  })
}

// PROVIDER-CONNECTIVITY-BRIDGE (P3) : vols/fulfillment-action.ts délègue à
// finalizeFlightBookingFinancials (lib/vols/flight-financials.ts) qui encapsule
// recordReservationFinancials — l'ancrage financier est toujours garanti mais
// via le wrapper, pas via un import direct dans fulfillment-action.ts.
{
  const fulfillmentSrc = readFileSync(
    join(ROOT, "lib/vols/fulfillment-action.ts"),
    "utf8",
  )
  test("Chantier 62 — vols/fulfillment-action.ts : délègue à finalizeFlightBookingFinancials (PROVIDER-CONNECTIVITY-BRIDGE)", () => {
    assert.match(
      fulfillmentSrc,
      /finalizeFlightBookingFinancials/,
      "fulfillment-action.ts doit appeler finalizeFlightBookingFinancials",
    )
    assert.match(
      fulfillmentSrc,
      /import.*finalizeFlightBookingFinancials/,
      "fulfillment-action.ts doit importer finalizeFlightBookingFinancials",
    )
  })
}

/* -------------------------------------------------------------------------- */
/* COMMISSION-WIRING-02 — câblage creditPlatformCommission dans les 10 modules */
/* manquants (Payment → Commission bridge, autoroute Supplier → Settlement)    */
/* -------------------------------------------------------------------------- */

// Modules cibles de COMMISSION-WIRING-02 (Voitures HORS PÉRIMÈTRE)
const COMMISSION_WIRING_FILES: Array<{ label: string; path: string }> = [
  { label: "vols/guest-booking-actions.ts", path: "lib/vols/guest-booking-actions.ts" },
  { label: "vols/flight-financials.ts", path: "lib/vols/flight-financials.ts" },
  { label: "transfers/actions.ts", path: "lib/transfers/actions.ts" },
  { label: "transfers/guest-booking-actions.ts", path: "lib/transfers/guest-booking-actions.ts" },
  { label: "hotels-monde/guest-booking-actions.ts", path: "lib/hotels-monde/guest-booking-actions.ts" },
  { label: "activities/booking-actions.ts", path: "lib/activities/booking-actions.ts" },
  { label: "activities/guest-booking-actions.ts", path: "lib/activities/guest-booking-actions.ts" },
  { label: "omra/booking-actions.ts", path: "lib/omra/booking-actions.ts" },
  { label: "omra/guest-booking-actions.ts", path: "lib/omra/guest-booking-actions.ts" },
  { label: "packages/booking-actions.ts", path: "lib/packages/booking-actions.ts" },
]

for (const { label, path } of COMMISSION_WIRING_FILES) {
  const src = readFileSync(join(ROOT, path), "utf8")

  test(`COMMISSION-WIRING-02 — ${label} : importe creditPlatformCommission`, () => {
    assert.match(
      src,
      /import\s*\{[^}]*creditPlatformCommission[^}]*\}\s*from\s*["']@\/lib\/finance\/platform-commission["']/,
      `${label} doit importer creditPlatformCommission depuis lib/finance/platform-commission`,
    )
  })

  test(`COMMISSION-WIRING-02 — ${label} : destructure commissionAmount depuis recordReservationFinancials`, () => {
    assert.match(
      src,
      /const\s*\{[^}]*commissionAmount[^}]*\}\s*=\s*await\s+recordReservationFinancials\(/,
      `${label} doit destructurer commissionAmount depuis recordReservationFinancials`,
    )
  })

  test(`COMMISSION-WIRING-02 — ${label} : creditPlatformCommission description inclut publicRef`, () => {
    assert.match(
      src,
      /description:\s*`[^`]*\$\{[^}]*publicRef[^}]*\}[^`]*`/,
      `${label} : creditPlatformCommission doit inclure publicRef dans la description`,
    )
  })
}

// Invariant anti-double-write : les fichiers corrigés (double-write bug pré-existant)
// ne doivent plus contenir qu'UN SEUL appel à recordReservationFinancials.
const SINGLE_WRITE_FILES: Array<{ label: string; path: string }> = [
  { label: "activities/guest-booking-actions.ts", path: "lib/activities/guest-booking-actions.ts" },
  { label: "omra/guest-booking-actions.ts", path: "lib/omra/guest-booking-actions.ts" },
  { label: "packages/booking-actions.ts", path: "lib/packages/booking-actions.ts" },
]

for (const { label, path } of SINGLE_WRITE_FILES) {
  const src = readFileSync(join(ROOT, path), "utf8")
  test(`COMMISSION-WIRING-02 — ${label} : au plus 2 appels recordReservationFinancials (B2C+B2B, pas de double-write)`, () => {
    const matches = src.match(/recordReservationFinancials\s*\(/g) ?? []
    // packages/booking-actions.ts a 2 chemins (B2C + B2B) → 2 appels légitimes
    // activities/guest et omra/guest n'ont qu'un chemin → 1 appel
    assert.ok(
      matches.length <= 2,
      `${label} ne doit pas avoir plus de 2 appels recordReservationFinancials (trouvé ${matches.length}) — double-write bug`,
    )
  })
}

/* -------------------------------------------------------------------------- */
/* CARS-COMMISSION-01 — câblage creditPlatformCommission module voitures      */
/* (COMMERCIAL-REVENUE-04 : dernier module sans commission, clôturé 2026-10)  */
/* -------------------------------------------------------------------------- */

const CARS_COMMISSION_FILES: Array<{ label: string; path: string }> = [
  { label: "cars/actions.ts", path: "lib/cars/actions.ts" },
  { label: "cars/guest-booking-actions.ts", path: "lib/cars/guest-booking-actions.ts" },
]

for (const { label, path } of CARS_COMMISSION_FILES) {
  const src = readFileSync(join(ROOT, path), "utf8")

  test(`CARS-COMMISSION-01 — ${label} : importe creditPlatformCommission`, () => {
    assert.match(
      src,
      /import\s*\{[^}]*creditPlatformCommission[^}]*\}\s*from\s*["']@\/lib\/finance\/platform-commission["']/,
      `${label} doit importer creditPlatformCommission depuis lib/finance/platform-commission`,
    )
  })

  test(`CARS-COMMISSION-01 — ${label} : destructure commissionAmount depuis recordReservationFinancials`, () => {
    assert.match(
      src,
      /const\s*\{[^}]*commissionAmount[^}]*\}\s*=\s*await\s+recordReservationFinancials\(/,
      `${label} doit destructurer commissionAmount depuis recordReservationFinancials`,
    )
  })

  test(`CARS-COMMISSION-01 — ${label} : creditPlatformCommission description inclut publicRef`, () => {
    assert.match(
      src,
      /description:\s*`[^`]*\$\{[^}]*publicRef[^}]*\}[^`]*`/,
      `${label} : creditPlatformCommission doit inclure publicRef dans la description`,
    )
  })
}

/* -------------------------------------------------------------------------- */
/* SETTLE-02 — Intégrité référentielle settlement (preuve ownership DB)        */
/* -------------------------------------------------------------------------- */

test("SETTLE-02 — schema financials.ts : commissionSettlementEntries.settlementId possède une FK vers commissionSettlements (ownership proof DB-enforced)", () => {
  // La FK manquante était le GAP-1 identifié lors de l'audit ownership SETTLEMENT :
  // sans .references(), une entrée pouvait pointer vers un settlement fantôme.
  assert.match(
    financialsSchemaSrc,
    /settlementId.*\n.*\.notNull\(\)\s*\n\s*\.references\(\(\)\s*=>\s*commissionSettlements\.id/s,
    "commissionSettlementEntries.settlementId doit avoir .references(() => commissionSettlements.id)",
  )
})

test("SETTLE-02 — migration 0104 : ADD CONSTRAINT FK settlement_id → commission_settlements ON DELETE RESTRICT", () => {
  assert.match(
    migration0104Src,
    /ADD CONSTRAINT.*commission_settlement_entries_settlement_fk/i,
    "migration 0104 doit nommer la contrainte commission_settlement_entries_settlement_fk",
  )
  assert.match(
    migration0104Src,
    /REFERENCES\s+commission_settlements\s*\(id\)/i,
    "migration 0104 doit référencer commission_settlements(id)",
  )
  assert.match(
    migration0104Src,
    /ON DELETE RESTRICT/i,
    "migration 0104 : ON DELETE RESTRICT (empêche suppression settlement avec entrées rattachées)",
  )
})

/* -------------------------------------------------------------------------- */
/* SETTLE-02b — GAP-2 : economic_entitlements.settlementRef uuid FK           */
/* -------------------------------------------------------------------------- */

test("SETTLE-02b — schema.ts : economic_entitlements.settlementRef est uuid avec FK vers commissionSettlements (GAP-2 fermé)", () => {
  // Avant SETTLE-02b, settlementRef était text sans FK (convention de code seulement).
  // Après : uuid avec .references(() => commissionSettlements.id, { onDelete: "set null" }).
  // Vérifie que settlementRef utilise uuid() (pas text()) et référence commissionSettlements.id
  assert.match(
    economicEntitlementsSchemaSrc,
    /settlementRef:\s*uuid\(/,
    "economic_entitlements.settlementRef doit être déclaré uuid() (pas text())",
  )
  assert.match(
    economicEntitlementsSchemaSrc,
    /settlementRef[\s\S]{0,200}commissionSettlements\.id/,
    "economic_entitlements.settlementRef doit référencer commissionSettlements.id",
  )
})

test("SETTLE-02b — migration 0105 : ALTER COLUMN settlement_ref text → uuid + FK ON DELETE SET NULL", () => {
  assert.match(
    migration0105Src,
    /ALTER COLUMN settlement_ref TYPE uuid/i,
    "migration 0105 doit convertir settlement_ref de text en uuid",
  )
  assert.match(
    migration0105Src,
    /ADD CONSTRAINT.*economic_entitlements_settlement_ref_fk/i,
    "migration 0105 doit nommer la contrainte economic_entitlements_settlement_ref_fk",
  )
  assert.match(
    migration0105Src,
    /REFERENCES\s+commission_settlements\s*\(id\)/i,
    "migration 0105 doit référencer commission_settlements(id)",
  )
  assert.match(
    migration0105Src,
    /ON DELETE SET NULL/i,
    "migration 0105 : ON DELETE SET NULL (preservation vs cascade RESTRICT)",
  )
})

test("SETTLE-02b — migration 0105 : mark_econ_commission_settled() mise à jour (sans cast ::text)", () => {
  // La fonction originale (0093) écrivait p_settlement_ref::text car settlement_ref était text.
  // Après 0105, settlement_ref est uuid → le cast ::text est retiré.
  assert.match(
    migration0105Src,
    /settlement_ref\s*=\s*p_settlement_ref[^:]/,
    "migration 0105 : mark_econ_commission_settled doit écrire p_settlement_ref sans cast ::text",
  )
})

/* -------------------------------------------------------------------------- */
/* WALLET-GAP-1 — FK wallet_ledger.wallet_account_id → wallet_accounts(id)   */
/* (2026-10-04 : mouvement orphelin impossible désormais)                     */
/* -------------------------------------------------------------------------- */

test("WALLET-GAP-1 — schema financials.ts : walletLedger.walletAccountId possède une FK vers walletAccounts (ownership proof DB-enforced)", () => {
  assert.match(
    financialsSchemaSrc,
    /walletAccountId[\s\S]{0,200}\.references\(\(\)\s*=>\s*walletAccounts\.id/,
    "walletLedger.walletAccountId doit avoir .references(() => walletAccounts.id)",
  )
})

test("WALLET-GAP-1 — migration 0106 : ADD CONSTRAINT FK wallet_account_id → wallet_accounts ON DELETE RESTRICT", () => {
  assert.match(
    migration0106Src,
    /ADD CONSTRAINT.*wallet_ledger_wallet_account_id_fk/i,
    "migration 0106 doit nommer la contrainte wallet_ledger_wallet_account_id_fk",
  )
  assert.match(
    migration0106Src,
    /REFERENCES\s+wallet_accounts\s*\(id\)/i,
    "migration 0106 doit référencer wallet_accounts(id)",
  )
  assert.match(
    migration0106Src,
    /ON DELETE RESTRICT/i,
    "migration 0106 : ON DELETE RESTRICT (empêche suppression compte avec mouvements rattachés)",
  )
})

/* -------------------------------------------------------------------------- */
/* WALLET-GAP-2 — CHECK wallet_ledger.category IN allowed set                */
/* (2026-10-04 : valeur arbitraire impossible désormais)                      */
/* -------------------------------------------------------------------------- */

test("WALLET-GAP-2 — schema financials.ts : walletLedger possède un check wallet_ledger_category_check", () => {
  assert.match(
    financialsSchemaSrc,
    /wallet_ledger_category_check/,
    "financials.ts doit déclarer le check wallet_ledger_category_check",
  )
})

test("WALLET-GAP-2 — migration 0107 : ADD CONSTRAINT CHECK category IN 6-value set", () => {
  assert.match(
    migration0107Src,
    /ADD CONSTRAINT.*wallet_ledger_category_check/i,
    "migration 0107 doit nommer la contrainte wallet_ledger_category_check",
  )
  assert.match(
    migration0107Src,
    /category IS NULL/i,
    "migration 0107 : la CHECK doit autoriser NULL (lignes historiques)",
  )
  // Vérifie que les 6 valeurs métier sont présentes
  for (const val of ["booking", "recharge", "refund", "commission", "fee", "adjustment"]) {
    assert.match(
      migration0107Src,
      new RegExp(`'${val}'`),
      `migration 0107 : la CHECK doit inclure la valeur '${val}'`,
    )
  }
})

/* -------------------------------------------------------------------------- */
/* WALLET-GAP-3 — idempotencyKey dans creditCustomerWallet (triple-layer)    */
/* (2026-10-04 : refund/adjustment double-crédit impossible désormais)        */
/* -------------------------------------------------------------------------- */

test("WALLET-GAP-3 — customer-wallet.ts : CreditCustomerWalletInput déclare idempotencyKey", () => {
  assert.match(
    customerWalletSrc,
    /idempotencyKey\?:\s*string/,
    "CreditCustomerWalletInput doit déclarer idempotencyKey?: string",
  )
})

test("WALLET-GAP-3 — customer-wallet.ts : creditCustomerWallet utilise SAVEPOINT idem_credit_insert (L3 idempotence)", () => {
  assert.match(
    customerWalletSrc,
    /SAVEPOINT idem_credit_insert/,
    "creditCustomerWallet doit utiliser SAVEPOINT idem_credit_insert pour L3 idempotence",
  )
})

test("WALLET-GAP-3 — customer-wallet.ts : creditCustomerWallet utilise clé Redis e2b:idem:customer-wallet-credit: (L1 idempotence)", () => {
  assert.match(
    customerWalletSrc,
    /e2b:idem:customer-wallet-credit:/,
    "creditCustomerWallet doit utiliser la clé Redis e2b:idem:customer-wallet-credit: pour L1 idempotence",
  )
})

/* -------------------------------------------------------------------------- */
/* PARTNER-GAP-1 — CHECK agencies.status IN ('active','suspended')            */
/* (2026-10-04 : valeur arbitraire impossible désormais)                      */
/* -------------------------------------------------------------------------- */

test("PARTNER-GAP-1 — schema.ts : agencies possède un check agencies_status_check", () => {
  assert.match(
    agenciesSchemaSrc,
    /agencies_status_check/,
    "schema.ts doit déclarer le check agencies_status_check sur la table agencies",
  )
})

test("PARTNER-GAP-1 — migration 0108 : ADD CONSTRAINT CHECK status IN ('active','suspended')", () => {
  assert.match(
    migration0108Src,
    /ADD CONSTRAINT.*agencies_status_check/i,
    "migration 0108 doit nommer la contrainte agencies_status_check",
  )
  assert.match(
    migration0108Src,
    /status IN \('active','suspended'\)/i,
    "migration 0108 : la CHECK doit lister exactement ('active','suspended')",
  )
})
