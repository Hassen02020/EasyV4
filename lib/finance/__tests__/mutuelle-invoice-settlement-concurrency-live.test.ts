/**
 * MUTUELLE-INVOICE-SETTLEMENT-01 × MUTUELLE-CONCURRENCY-COMPLETE-01
 * (réconciliation) — preuve de concurrence RÉELLE sur les deux fonctions
 * financières nouvelles de ce chantier combiné :
 *
 *  - generateIssuedInvoiceForReservation (lib/finance/invoice-actions.ts) :
 *    deux créations concurrentes pour la MÊME réservation ne doivent jamais
 *    produire deux factures.
 *  - confirmMutuelleInvoiceSettlementCore
 *    (lib/finance/mutuelle-invoice-settlement-actions.ts) : deux
 *    confirmations concurrentes de règlement sur la MÊME facture ne
 *    doivent jamais produire une double écriture d'audit ni un double
 *    règlement.
 *
 * Chaque appel ouvre SA PROPRE transaction (aucun txOverride partagé),
 * comme deux requêtes HTTP concurrentes réelles — même discipline que
 * lib/finance/__tests__/customer-wallet-concurrency.test.ts et
 * lib/pro/__tests__/booking-actions-concurrency.test.ts.
 *
 * ⚠️ Ces tests n'étaient PAS couverts avant cette réconciliation — point C
 * du rapport de revue MUTUELLE-INVOICE-SETTLEMENT-01 ("concurrence réelle
 * non prouvée"). Ils ferment ce point.
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, and, sql } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import { agencies, customers, reservations, partnerInvoices } from "@/lib/db/schema"
import { generateIssuedInvoiceForReservation } from "@/lib/finance/invoice-actions"
import { confirmMutuelleInvoiceSettlementCore } from "@/lib/finance/mutuelle-invoice-settlement-actions"

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

async function createConfirmedReservation(
  tndAmount: string,
): Promise<{ agencyId: string; reservationId: string; userId: string }> {
  const suffix = randomUUID().slice(0, 8)
  return withSystemContext(async (tx) => {
    const [agency] = await tx
      .insert(agencies)
      .values({
        name: `Mutuelle Settlement Concurrency Test ${suffix}`,
        agencyType: "ota",
        slug: `mutuelle-settle-concurrency-${suffix}`,
      })
      .returning({ id: agencies.id })
    const [customer] = await tx
      .insert(customers)
      .values({
        agencyId: agency!.id,
        civility: "M",
        firstName: "Test",
        lastName: `Member ${suffix}`,
      })
      .returning({ id: customers.id })
    const [reservation] = await tx
      .insert(reservations)
      .values({
        agencyId: agency!.id,
        publicRef: `MUT-CONC-${suffix}`,
        customerId: customer!.id,
        module: "flight",
        source: "manual",
        status: "confirmed",
        originalCurrency: "TND",
        originalAmount: tndAmount,
        tndAmount,
      })
      .returning({ id: reservations.id })
    return {
      agencyId: agency!.id,
      reservationId: reservation!.id,
      userId: randomUUID(),
    }
  })
}

async function cleanupReservation(fixture: {
  agencyId: string
  reservationId: string
}): Promise<void> {
  await withSystemContext(async (tx) => {
    await tx.execute(
      sql`delete from audit_events where agency_id = ${fixture.agencyId}`,
    )
    await tx
      .delete(partnerInvoices)
      .where(eq(partnerInvoices.reservationId, fixture.reservationId))
    await tx
      .delete(reservations)
      .where(eq(reservations.id, fixture.reservationId))
    await tx.delete(customers).where(eq(customers.agencyId, fixture.agencyId))
    await tx.delete(agencies).where(eq(agencies.id, fixture.agencyId))
  })
}

let creationFixture: Awaited<ReturnType<typeof createConfirmedReservation>> | null =
  null
let settlementFixture:
  | Awaited<ReturnType<typeof createConfirmedReservation>>
  | null = null
let settlementInvoiceId: string | null = null

before(async () => {
  dbAvailable = await isDbAvailable()
  if (!dbAvailable) return
  creationFixture = await createConfirmedReservation("1200.00")
  settlementFixture = await createConfirmedReservation("640.00")

  // Facture "issued" préexistante pour le test de règlement concurrent —
  // créée hors course, par un appel séquentiel normal (pas la cible du test).
  const created = await generateIssuedInvoiceForReservation({
    agencyId: settlementFixture.agencyId,
    reservationId: settlementFixture.reservationId,
    actorUserId: settlementFixture.userId,
  })
  assert.ok(created.ok, "fixture : la facture issued doit se créer")
  if (created.ok) settlementInvoiceId = created.invoiceId
})

after(async () => {
  if (!dbAvailable) return
  if (creationFixture) await cleanupReservation(creationFixture)
  if (settlementFixture) await cleanupReservation(settlementFixture)
})

test("CONCURRENCE RÉELLE — deux créations simultanées de facture pour la MÊME réservation → exactement 1 facture", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())

  const [resultA, resultB] = await Promise.all([
    generateIssuedInvoiceForReservation({
      agencyId: creationFixture!.agencyId,
      reservationId: creationFixture!.reservationId,
      actorUserId: creationFixture!.userId,
    }),
    generateIssuedInvoiceForReservation({
      agencyId: creationFixture!.agencyId,
      reservationId: creationFixture!.reservationId,
      actorUserId: creationFixture!.userId,
    }),
  ])

  assert.ok(resultA.ok, "bras A doit réussir (création ou relecture)")
  assert.ok(resultB.ok, "bras B doit réussir (création ou relecture)")
  if (!resultA.ok || !resultB.ok) return

  assert.equal(
    resultA.invoiceId,
    resultB.invoiceId,
    "les deux bras doivent référencer la MÊME facture",
  )
  // L'un des deux (jamais les deux) doit être le créateur réel.
  const createdCount = [resultA.alreadyExisted, resultB.alreadyExisted].filter(
    (v) => v === false,
  ).length
  assert.equal(
    createdCount,
    1,
    "exactement un bras doit être le créateur réel (alreadyExisted:false)",
  )

  const rows = await withSystemContext((tx) =>
    tx
      .select()
      .from(partnerInvoices)
      .where(eq(partnerInvoices.reservationId, creationFixture!.reservationId)),
  )
  assert.equal(rows.length, 1, "une seule ligne partner_invoices au final")
  assert.equal(rows[0]!.status, "issued")
  assert.equal(rows[0]!.amountPaid, "0.00")
})

test("CONCURRENCE RÉELLE — deux confirmations simultanées de règlement sur la MÊME facture → 1 seule transition, 1 seul audit", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())
  assert.ok(settlementInvoiceId, "fixture : invoiceId requis")

  const [resultA, resultB] = await Promise.all([
    confirmMutuelleInvoiceSettlementCore(
      settlementFixture!.agencyId,
      settlementFixture!.userId,
      { invoiceId: settlementInvoiceId!, reference: "VIR-CONCURRENCE-A" },
    ),
    confirmMutuelleInvoiceSettlementCore(
      settlementFixture!.agencyId,
      settlementFixture!.userId,
      { invoiceId: settlementInvoiceId!, reference: "VIR-CONCURRENCE-B" },
    ),
  ])

  assert.ok(resultA.ok, "bras A ne doit jamais échouer (idempotent)")
  assert.ok(resultB.ok, "bras B ne doit jamais échouer (idempotent)")
  if (!resultA.ok || !resultB.ok) return

  const settledCount = [resultA.alreadySettled, resultB.alreadySettled].filter(
    (v) => v === false,
  ).length
  assert.equal(
    settledCount,
    1,
    "exactement un bras doit avoir réellement effectué la transition (alreadySettled:false)",
  )

  const [row] = await withSystemContext((tx) =>
    tx
      .select()
      .from(partnerInvoices)
      .where(eq(partnerInvoices.id, settlementInvoiceId!)),
  )
  assert.equal(row!.status, "paid")
  assert.equal(row!.amountPaid, "640.00")

  const auditRows = await withSystemContext((tx) =>
    tx.execute(
      sql`select * from audit_events where entity_id = ${settlementInvoiceId} and action = 'mutuelle_invoice.settled'`,
    ),
  )
  assert.equal(
    auditRows.length,
    1,
    "exactement 1 ligne audit_events pour ce règlement — jamais 2",
  )
})
