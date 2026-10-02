/**
 * CURRENCY-DIM-01 (plomberie uniquement) — preuve live (Postgres réel) que
 * `recordReservationFinancials()` :
 *
 *  1. garde un comportement STRICTEMENT inchangé quand `supplierOriginal`/
 *     `saleOriginal`/`exchangeRate` sont absents (les 13 call sites réels
 *     actuels — aucun ne les passe) : `supplier_currency`/`sale_currency`
 *     = "TND", `exchange_rate`/`exchange_rate_at` = valeurs par défaut
 *     (`1`/`null`) ;
 *  2. persiste fidèlement de vraies valeurs quand elles sont fournies —
 *     sans les calculer ni les inventer, uniquement les transmettre.
 *
 * Aucun appelant réel ne fournit ces paramètres aujourd'hui (voir
 * commentaire de tête de reservation-financials.ts) : ce fichier ne prouve
 * que le mécanisme, pas un câblage Vols/Hotels-Monde (hors scope de ce
 * chantier — aucun fournisseur réel connecté pour l'un ou l'autre).
 *
 * Même convention que economic-entitlements-network.test.ts : se dégrade
 * en `skip` sans DATABASE_URL/Postgres local disponible.
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import {
  withSystemContext,
  withTenantContext,
  type TenantContext,
} from "@/lib/db/tenant-context"
import {
  agencies,
  customers,
  reservations,
  reservationFinancials,
} from "@/lib/db/schema"
import { recordReservationFinancials } from "../reservation-financials"

async function isDbAvailable(): Promise<boolean> {
  try {
    await withSystemContext(async (tx) => {
      await tx.execute(sql`select 1`)
    })
    return true
  } catch {
    return false
  }
}

let dbAvailable = false
const skipReason = () => "Postgres local indisponible (DATABASE_URL)."

let agencyId = ""
let customerId = ""
let reservationIdNoCurrency = ""
let reservationIdWithCurrency = ""

before(async () => {
  dbAvailable = await isDbAvailable()
  if (!dbAvailable) return

  agencyId = randomUUID()
  customerId = randomUUID()

  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values({
      id: agencyId,
      name: "CURRENCY-DIM-01 Plumbing Agency",
      agencyType: "partner",
      slug: `currency-dim-01-${agencyId.slice(0, 8)}`,
    })
    await tx.insert(customers).values({
      id: customerId,
      agencyId,
      firstName: "Test",
      lastName: "CurrencyDim01",
    })
  })

  const ctx: TenantContext = {
    agencyId,
    userId: randomUUID(),
    isSuperAdmin: false,
  }
  ;[reservationIdNoCurrency, reservationIdWithCurrency] =
    await withTenantContext(ctx, async (tx) => {
      const rows = await tx
        .insert(reservations)
        .values([
          {
            agencyId,
            publicRef: `CD01-A-${randomUUID().slice(0, 8)}`,
            customerId,
            module: "hotel",
            source: "internal",
            status: "confirmed",
            originalCurrency: "TND",
            originalAmount: "100.00",
            tndAmount: "100.00",
          },
          {
            agencyId,
            publicRef: `CD01-B-${randomUUID().slice(0, 8)}`,
            customerId,
            module: "hotel",
            source: "internal",
            status: "confirmed",
            originalCurrency: "EUR",
            originalAmount: "30.00",
            tndAmount: "100.00",
          },
        ])
        .returning({ id: reservations.id })
      return rows.map((r) => r.id)
    })
})

after(async () => {
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    await tx
      .delete(reservationFinancials)
      .where(eq(reservationFinancials.reservationId, reservationIdNoCurrency))
    await tx
      .delete(reservationFinancials)
      .where(eq(reservationFinancials.reservationId, reservationIdWithCurrency))
    await tx
      .delete(reservations)
      .where(eq(reservations.id, reservationIdNoCurrency))
    await tx
      .delete(reservations)
      .where(eq(reservations.id, reservationIdWithCurrency))
    await tx.delete(customers).where(eq(customers.id, customerId))
    await tx.delete(agencies).where(eq(agencies.id, agencyId))
  })
})

test("sans supplierOriginal/saleOriginal/exchangeRate : comportement STRICTEMENT inchangé (supplier_currency/sale_currency='TND', exchange_rate/exchange_rate_at = défauts)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())

  const ctx: TenantContext = {
    agencyId,
    userId: randomUUID(),
    isSuperAdmin: false,
  }
  await withTenantContext(ctx, (tx) =>
    recordReservationFinancials({
      tx,
      reservationId: reservationIdNoCurrency,
      supplierPriceTnd: 80,
      salePriceTnd: 100,
    }),
  )

  const [row] = await withSystemContext((tx) =>
    tx
      .select()
      .from(reservationFinancials)
      .where(eq(reservationFinancials.reservationId, reservationIdNoCurrency)),
  )
  assert.ok(row, "la ligne reservation_financials doit exister")
  assert.equal(row!.supplierCurrency, "TND")
  assert.equal(row!.saleCurrency, "TND")
  assert.equal(row!.supplierPrice, "80.00")
  assert.equal(row!.salePrice, "100.00")
  assert.equal(
    row!.exchangeRate,
    "1.000000",
    "valeur par défaut du schéma, jamais écrasée quand absent",
  )
  assert.equal(row!.exchangeRateAt, null)
})

test("avec supplierOriginal/saleOriginal/exchangeRate réels fournis : persistés fidèlement, jamais recalculés", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())

  const exchangeRateAt = new Date("2026-10-01T12:00:00Z")

  const ctx: TenantContext = {
    agencyId,
    userId: randomUUID(),
    isSuperAdmin: false,
  }
  await withTenantContext(ctx, (tx) =>
    recordReservationFinancials({
      tx,
      reservationId: reservationIdWithCurrency,
      supplierPriceTnd: 100,
      salePriceTnd: 100,
      supplierOriginal: { amount: 30, currency: "EUR" },
      saleOriginal: { amount: 100, currency: "TND" },
      exchangeRate: { rate: 3.3333, at: exchangeRateAt },
    }),
  )

  const [row] = await withSystemContext((tx) =>
    tx
      .select()
      .from(reservationFinancials)
      .where(
        eq(reservationFinancials.reservationId, reservationIdWithCurrency),
      ),
  )
  assert.ok(row, "la ligne reservation_financials doit exister")
  assert.equal(row!.supplierCurrency, "EUR")
  assert.equal(row!.supplierPrice, "30.00")
  assert.equal(
    row!.supplierPriceTnd,
    "100.00",
    "le montant TND reste celui fourni, jamais recalculé ici",
  )
  assert.equal(row!.saleCurrency, "TND")
  assert.equal(row!.exchangeRate, "3.333300")
  assert.equal(row!.exchangeRateAt?.toISOString(), exchangeRateAt.toISOString())
})
