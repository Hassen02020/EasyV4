/**
 * Tests unitaires — chaîne commission (Chantiers 37A/B).
 *
 * Couvre :
 *  - `recordReservationFinancials` : formule commissionAmount, return value,
 *    cas B2C sans commission, cas B2B avec commission, edge case supplier=0.
 *  - `creditPlatformCommission` : guard commissionAmount ≤ 0 → no-op,
 *    appel tx.execute() quand commissionAmount > 0.
 *
 * Pas de DB réelle — mock tx minimal capturant les appels Drizzle.
 */

import test from "node:test"
import assert from "node:assert/strict"

import { recordReservationFinancials } from "@/lib/finance/reservation-financials"
import { creditPlatformCommission } from "@/lib/finance/platform-commission"
import type { DrizzleTransaction } from "@/lib/db/client"

/* -------------------------------------------------------------------------- */
/* Helpers mock                                                                 */
/* -------------------------------------------------------------------------- */

function makeMockInsertTx() {
  let captured: Record<string, unknown> = {}
  const tx = {
    insert: (_table: unknown) => ({
      values: (row: Record<string, unknown>) => {
        captured = { ...row }
        return Promise.resolve()
      },
    }),
  } as unknown as DrizzleTransaction
  return { tx, getCaptured: () => captured }
}

function makeMockExecuteTx() {
  const calls: unknown[] = []
  const tx = {
    execute: async (query: unknown) => {
      calls.push(query)
      return undefined
    },
  } as unknown as DrizzleTransaction
  return { tx, callCount: () => calls.length }
}

/* -------------------------------------------------------------------------- */
/* recordReservationFinancials                                                  */
/* -------------------------------------------------------------------------- */

test("recordReservationFinancials : sans commissionPercent → commissionAmount = 0", async () => {
  const { tx, getCaptured } = makeMockInsertTx()
  const result = await recordReservationFinancials({
    tx,
    reservationId: "00000000-0000-0000-0000-000000000001",
    supplierPriceTnd: 1000,
    salePriceTnd: 1150,
  })
  assert.equal(result.commissionAmount, 0)
  assert.equal(getCaptured().commissionAmount, "0.00")
  assert.equal(getCaptured().commissionPercent, "0.00")
})

test("recordReservationFinancials : commissionPercent=0 explicite → commissionAmount = 0", async () => {
  const { tx, getCaptured } = makeMockInsertTx()
  const result = await recordReservationFinancials({
    tx,
    reservationId: "00000000-0000-0000-0000-000000000002",
    supplierPriceTnd: 800,
    salePriceTnd: 920,
    commissionPercent: 0,
  })
  assert.equal(result.commissionAmount, 0)
  assert.equal(getCaptured().commissionAmount, "0.00")
})

test("recordReservationFinancials : B2B 15% marge, 3% commission → 4.50 TND", async () => {
  const { tx, getCaptured } = makeMockInsertTx()
  // supplier=1000, sale=1150 → margin=150 → commission=150×0.03=4.50
  const result = await recordReservationFinancials({
    tx,
    reservationId: "00000000-0000-0000-0000-000000000003",
    supplierPriceTnd: 1000,
    salePriceTnd: 1150,
    commissionPercent: 3,
  })
  assert.equal(result.commissionAmount, 4.5)
  assert.equal(getCaptured().commissionAmount, "4.50")
  assert.equal(getCaptured().commissionPercent, "3.00")
  assert.equal(getCaptured().marginAmount, "150.00")
  assert.equal(getCaptured().marginPercent, "15.00")
})

test("recordReservationFinancials : arrondi à 2 décimales (Math.round ×100/100)", async () => {
  const { tx, getCaptured } = makeMockInsertTx()
  // supplier=333, sale=500 → margin=167 → 5% → 167×0.05=8.35 (exact)
  const result = await recordReservationFinancials({
    tx,
    reservationId: "00000000-0000-0000-0000-000000000004",
    supplierPriceTnd: 333,
    salePriceTnd: 500,
    commissionPercent: 5,
  })
  // 167 × 0.05 = 8.35
  assert.equal(result.commissionAmount, 8.35)
  assert.equal(getCaptured().commissionAmount, "8.35")
})

test("recordReservationFinancials : arrondi correct pour fraction non ronde", async () => {
  const { tx } = makeMockInsertTx()
  // supplier=100, sale=110 → margin=10 → 7% → 10×0.07=0.70
  const result = await recordReservationFinancials({
    tx,
    reservationId: "00000000-0000-0000-0000-000000000005",
    supplierPriceTnd: 100,
    salePriceTnd: 110,
    commissionPercent: 7,
  })
  assert.equal(result.commissionAmount, 0.7)
})

test("recordReservationFinancials : supplier=0 → marginPercent=0 (pas de division par zéro)", async () => {
  const { tx, getCaptured } = makeMockInsertTx()
  const result = await recordReservationFinancials({
    tx,
    reservationId: "00000000-0000-0000-0000-000000000006",
    supplierPriceTnd: 0,
    salePriceTnd: 100,
    commissionPercent: 10,
  })
  // marginAmount = 100 − 0 = 100, commissionAmount = 10
  assert.equal(result.commissionAmount, 10)
  assert.equal(getCaptured().marginPercent, "0.00")
})

test("recordReservationFinancials : snapshot complet — toutes les colonnes sont passées au tx.insert", async () => {
  const { tx, getCaptured } = makeMockInsertTx()
  await recordReservationFinancials({
    tx,
    reservationId: "00000000-0000-0000-0000-000000000007",
    supplierPriceTnd: 500,
    salePriceTnd: 575,
    commissionPercent: 4,
  })
  const row = getCaptured()
  assert.equal(row.reservationId, "00000000-0000-0000-0000-000000000007")
  assert.equal(row.supplierPrice, "500.00")
  assert.equal(row.supplierCurrency, "TND")
  assert.equal(row.supplierPriceTnd, "500.00")
  assert.equal(row.salePrice, "575.00")
  assert.equal(row.saleCurrency, "TND")
  assert.equal(row.salePriceTnd, "575.00")
  assert.equal(row.marginAmount, "75.00")
  // 75/500 × 100 = 15
  assert.equal(row.marginPercent, "15.00")
  // 75 × 0.04 = 3.00
  assert.equal(row.commissionAmount, "3.00")
  assert.equal(row.commissionPercent, "4.00")
})

/* -------------------------------------------------------------------------- */
/* creditPlatformCommission                                                     */
/* -------------------------------------------------------------------------- */

test("creditPlatformCommission : commissionAmount = 0 → tx.execute jamais appelé", async () => {
  const { tx, callCount } = makeMockExecuteTx()
  await creditPlatformCommission(tx, {
    reservationId: "00000000-0000-0000-0000-000000000010",
    commissionAmount: 0,
    description: "test",
  })
  assert.equal(callCount(), 0)
})

test("creditPlatformCommission : commissionAmount < 0 → tx.execute jamais appelé", async () => {
  const { tx, callCount } = makeMockExecuteTx()
  await creditPlatformCommission(tx, {
    reservationId: "00000000-0000-0000-0000-000000000011",
    commissionAmount: -5,
    description: "test",
  })
  assert.equal(callCount(), 0)
})

test("creditPlatformCommission : commissionAmount > 0 → tx.execute appelé exactement une fois", async () => {
  const { tx, callCount } = makeMockExecuteTx()
  await creditPlatformCommission(tx, {
    reservationId: "00000000-0000-0000-0000-000000000012",
    commissionAmount: 4.5,
    description: "Commission hôtel — réservation REF-001",
  })
  assert.equal(callCount(), 1)
})
