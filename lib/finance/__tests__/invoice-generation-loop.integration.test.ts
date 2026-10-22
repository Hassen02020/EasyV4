/**
 * VAL-01 / E5-01 — Tests d'intégration DB pour generateInvoiceForReservation.
 *
 * Complète les invariants statiques de invoice-wiring.test.ts en exerçant
 * la fonction avec une vraie base PostgreSQL :
 *
 * 1. Réservation non confirmée → RESERVATION_NOT_CONFIRMED (pas de facture).
 * 2. Réservation confirmée → ok:true, alreadyExisted:false, facture créée.
 * 3. Retry sur même réservation confirmée → ok:true, alreadyExisted:true
 *    (idempotence 23505 réelle, pas simulée).
 *
 * Pattern : fixtures créées dans before(), supprimées dans after().
 * Se dégradent en skip() si PostgreSQL est indisponible (CI sans DB).
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"

import { withSystemContext, withTenantContext } from "@/lib/db/tenant-context"
import {
  agencies,
  customers,
  partnerInvoices,
  reservations,
} from "@/lib/db/schema"
import { generateInvoiceForReservation } from "@/lib/finance/invoice-actions"

/* -------------------------------------------------------------------------- */
/* DB availability guard                                                        */
/* -------------------------------------------------------------------------- */

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
const skip = () => "PostgreSQL indisponible (DATABASE_URL)."

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                     */
/* -------------------------------------------------------------------------- */

let agencyId = ""
let customerId = ""
let reservationIdPending = ""
let reservationIdConfirmed = ""

before(async () => {
  dbAvailable = await isDbAvailable()
  if (!dbAvailable) return

  agencyId = randomUUID()
  customerId = randomUUID()
  reservationIdPending = randomUUID()
  reservationIdConfirmed = randomUUID()

  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values({
      id: agencyId,
      slug: `e5-01-inv-${agencyId.slice(0, 8)}`,
      name: "E5-01 Invoice Loop Test Agency",
      agencyType: "ota",
      depositBalance: "10000.000",
      reservationTolerance: "500.000",
    })

    await tx.insert(customers).values({
      id: customerId,
      agencyId,
      firstName: "E5",
      lastName: "InvoiceLoop",
      email: `e5-01-inv-${agencyId.slice(0, 8)}@test.invalid`,
    })

    await tx.insert(reservations).values([
      {
        id: reservationIdPending,
        agencyId,
        publicRef: `E5-PENDING-${agencyId.slice(0, 6)}`,
        customerId,
        module: "hotel",
        source: "manual",
        status: "pending",
        originalCurrency: "TND",
        originalAmount: "750.00",
        tndAmount: "750.00",
      },
      {
        id: reservationIdConfirmed,
        agencyId,
        publicRef: `E5-CONFIRMED-${agencyId.slice(0, 6)}`,
        customerId,
        module: "hotel",
        source: "manual",
        status: "confirmed",
        originalCurrency: "TND",
        originalAmount: "1200.00",
        tndAmount: "1200.00",
      },
    ])
  })
})

after(async () => {
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    await tx
      .delete(partnerInvoices)
      .where(eq(partnerInvoices.agencyId, agencyId))
    await tx
      .delete(reservations)
      .where(eq(reservations.agencyId, agencyId))
    await tx.delete(customers).where(eq(customers.agencyId, agencyId))
    await tx.delete(agencies).where(eq(agencies.id, agencyId))
  })
})

/* -------------------------------------------------------------------------- */
/* Test 1 — réservation non confirmée → RESERVATION_NOT_CONFIRMED              */
/* -------------------------------------------------------------------------- */

test("E5-01-01 : generateInvoiceForReservation — status=pending → ok:false, RESERVATION_NOT_CONFIRMED", async (t) => {
  if (!dbAvailable) return void t.skip(skip())

  const result = await generateInvoiceForReservation({
    agencyId,
    reservationId: reservationIdPending,
    actorUserId: "",
  })

  assert.strictEqual(result.ok, false)
  assert.ok("error" in result)
  assert.strictEqual(
    (result as { ok: false; error: string }).error,
    "RESERVATION_NOT_CONFIRMED",
  )

  // Aucune facture ne doit avoir été créée
  const rows = await withTenantContext(
    { agencyId, userId: "", isSuperAdmin: false },
    (tx) =>
      tx
        .select({ id: partnerInvoices.id })
        .from(partnerInvoices)
        .where(eq(partnerInvoices.reservationId, reservationIdPending)),
  )
  assert.strictEqual(rows.length, 0, "aucune facture pour réservation pending")
})

/* -------------------------------------------------------------------------- */
/* Test 2 — réservation confirmée → facture créée                             */
/* -------------------------------------------------------------------------- */

test("E5-01-02 : generateInvoiceForReservation — status=confirmed → ok:true, alreadyExisted:false, facture en DB", async (t) => {
  if (!dbAvailable) return void t.skip(skip())

  const result = await generateInvoiceForReservation({
    agencyId,
    reservationId: reservationIdConfirmed,
    actorUserId: "",
  })

  assert.strictEqual(result.ok, true)
  if (!result.ok) return // type guard

  assert.strictEqual(result.alreadyExisted, false)
  assert.ok(result.invoiceId, "invoiceId non nul")
  assert.match(
    result.invoiceNumber,
    /^FA-\d{4}-\d{5}$/,
    `invoiceNumber doit correspondre à FA-YYYY-NNNNN, obtenu: ${result.invoiceNumber}`,
  )

  // Vérification en DB : la facture est bien persistée
  const rows = await withTenantContext(
    { agencyId, userId: "", isSuperAdmin: false },
    (tx) =>
      tx
        .select()
        .from(partnerInvoices)
        .where(eq(partnerInvoices.id, result.invoiceId)),
  )
  assert.strictEqual(rows.length, 1, "exactement une facture en DB")
  const inv = rows[0]
  assert.strictEqual(inv.status, "paid", 'status doit être "paid"')
  assert.strictEqual(inv.totalTva, "0.00", 'totalTva doit être "0.00"')
  assert.strictEqual(inv.reservationId, reservationIdConfirmed)
  assert.strictEqual(
    inv.invoiceNumber,
    result.invoiceNumber,
    "invoiceNumber cohérent",
  )
})

/* -------------------------------------------------------------------------- */
/* Test 3 — retry → alreadyExisted:true (idempotence 23505 réelle)            */
/* -------------------------------------------------------------------------- */

test("E5-01-03 : generateInvoiceForReservation — retry même réservation confirmée → ok:true, alreadyExisted:true (idempotence DB)", async (t) => {
  if (!dbAvailable) return void t.skip(skip())

  // Le test 2 a déjà créé la facture — on relance avec la même réservation
  const result = await generateInvoiceForReservation({
    agencyId,
    reservationId: reservationIdConfirmed,
    actorUserId: "",
  })

  assert.strictEqual(result.ok, true)
  if (!result.ok) return

  assert.strictEqual(
    result.alreadyExisted,
    true,
    "alreadyExisted doit être true lors du retry",
  )

  // Vérification : toujours une seule facture en DB (pas de doublon)
  const rows = await withTenantContext(
    { agencyId, userId: "", isSuperAdmin: false },
    (tx) =>
      tx
        .select({ id: partnerInvoices.id })
        .from(partnerInvoices)
        .where(eq(partnerInvoices.reservationId, reservationIdConfirmed)),
  )
  assert.strictEqual(rows.length, 1, "pas de doublon — toujours une seule facture")
})
