/**
 * CANCEL-FINANCIAL-COHERENCE-01, étape 2a — le règlement fournisseur Network
 * (0135) reste juste quand des lignes de COMPENSATION (D-02a :
 * `compensates_id`, montant négatif, ajout seulement) existent.
 *  - La liste des dettes regroupe chaque dette avec ses compensations et
 *    n'affiche jamais une compensation comme dette autonome.
 *  - Aucune jonction de règlement ne peut viser une compensation (0150).
 * PostgreSQL réel, rôle app_runtime (withSystemContext), mêmes fonctions
 * SECURITY DEFINER que la production.
 */
import test, { before } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { sql } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import {
  agencies,
  customers,
  economicEntitlements,
  reservations,
  supplierNodes,
  suppliers,
  users,
} from "@/lib/db/schema"
import {
  confirmSupplierSettlement,
  declareSupplierSettlement,
  listUnsettledSupplierDebts,
  requestSupplierSettlementCorrection,
} from "../supplier-settlement"

let dbAvailable = false
const skip = () => "Postgres local indisponible (DATABASE_URL)."

before(async () => {
  try {
    await withSystemContext((tx) => tx.execute(sql`select 1`))
    dbAvailable = true
  } catch {
    dbAvailable = false
  }
})

async function rejectsWith(p: Promise<unknown>, code: string) {
  await assert.rejects(p, (err) => {
    const msg =
      (err as { cause?: { message?: string } })?.cause?.message ??
      (err as Error)?.message
    assert.ok(msg?.includes(code), `attendu ${code}, reçu ${msg}`)
    return true
  })
}

/** Fournisseur + réservation annulée + droit fournisseur d'origine (1000). */
async function seed(compensation: number | null) {
  const s = randomUUID().slice(0, 8)
  return withSystemContext(async (tx) => {
    const [agency] = await tx
      .insert(agencies)
      .values({ name: `2a ${s}`, agencyType: "ota", slug: `cfc2a-${s}` })
      .returning({ id: agencies.id })
    const [customer] = await tx
      .insert(customers)
      .values({ agencyId: agency!.id, firstName: "2a", lastName: s })
      .returning({ id: customers.id })
    const [admin] = await tx
      .insert(users)
      .values({
        id: randomUUID(),
        agencyId: agency!.id,
        email: `cfc2a-${s}@test.local`,
        role: "super_admin",
        status: "active",
      })
      .returning({ id: users.id })
    const [supplier] = await tx
      .insert(suppliers)
      .values({ name: `2a ${s}`, type: "custom", status: "active" })
      .returning({ id: suppliers.id })
    const [node] = await tx
      .insert(supplierNodes)
      .values({
        supplierId: supplier!.id,
        slug: `cfc2a-${s}`,
        displayName: `2a ${s}`,
        onboardingStatus: "active",
      })
      .returning({ id: supplierNodes.id })
    const [res] = await tx
      .insert(reservations)
      .values({
        agencyId: agency!.id,
        publicRef: `CFC2A-${s}`,
        customerId: customer!.id,
        module: "network",
        source: "manual",
        status: "cancelled",
        originalCurrency: "TND",
        originalAmount: "1000.00",
        tndAmount: "1000.00",
      })
      .returning({ id: reservations.id })
    const line = {
      reservationId: res!.id,
      partyType: "supplier_node",
      partyId: node!.id,
      role: "supplier" as const,
      qualification: "supplier_cost",
      status: "earned" as const,
      effectiveAt: new Date(),
    }
    const [orig] = await tx
      .insert(economicEntitlements)
      .values({ ...line, amount: "1000.00", basis: "coût fournisseur" })
      .returning({ id: economicEntitlements.id })
    let compId: string | null = null
    if (compensation !== null) {
      const [comp] = await tx
        .insert(economicEntitlements)
        .values({
          ...line,
          amount: compensation.toFixed(2),
          basis: "compensation annulation (D-02a)",
          status: "compensated",
          compensatesId: orig!.id,
        })
        .returning({ id: economicEntitlements.id })
      compId = comp!.id
    }
    return { adminId: admin!.id, nodeId: node!.id, origId: orig!.id, compId }
  })
}

const NOTE = "Réservation annulée — vérifié (test 2a)"

test("live : compensation totale → plus aucune dette, et la compensation n'est jamais listée", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await seed(-1000)
  const debts = await listUnsettledSupplierDebts(f.nodeId)
  assert.equal(debts.length, 0)
})

test("live : compensation partielle (le fournisseur garde 300 de frais) → dette nette 300", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await seed(-700)
  const debts = await listUnsettledSupplierDebts(f.nodeId)
  assert.equal(debts.length, 1)
  const d = debts[0]!
  assert.equal(d.entitlementId, f.origId)
  assert.equal(d.amount, "1000.00")
  assert.equal(d.compensated, "-700.00")
  assert.equal(Number(d.recognizedDebt), 300)
  assert.equal(d.remaining, "300.00")
  assert.equal(d.overpaid, "0.00")
  assert.equal(d.disputedCancellation, true)
})

test("live : fournisseur déjà payé puis annulation compensée → trop-payé visible, plus de reste dû", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await seed(null)
  const sid = await declareSupplierSettlement(
    f.adminId,
    f.nodeId,
    [
      {
        entitlementId: f.origId,
        amount: 1000,
        cancellationReviewNote: NOTE,
      },
    ],
    "REF-2A",
    null,
  )
  await confirmSupplierSettlement(f.adminId, sid)
  await withSystemContext((tx) =>
    tx.insert(economicEntitlements).values({
      reservationId: sql`(select reservation_id from economic_entitlements where id = ${f.origId}::uuid)`,
      partyType: "supplier_node",
      partyId: f.nodeId,
      role: "supplier",
      qualification: "supplier_cost",
      amount: "-1000.00",
      basis: "compensation annulation (D-02a)",
      status: "compensated",
      effectiveAt: new Date(),
      compensatesId: f.origId,
    }),
  )
  const [d] = await listUnsettledSupplierDebts(f.nodeId)
  assert.ok(d, "listé car trop-payé")
  assert.equal(d!.remaining, "0.00")
  assert.equal(d!.overpaid, "1000.00")
})

test("live : impossible de déclarer un règlement sur une ligne de compensation (0150)", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await seed(-700)
  await rejectsWith(
    declareSupplierSettlement(
      f.adminId,
      f.nodeId,
      [
        {
          entitlementId: f.compId!,
          amount: 10,
          cancellationReviewNote: NOTE,
        },
      ],
      "REF-COMP",
      null,
    ),
    "SUPPLIER_SETTLEMENT_COMPENSATION_ENTITLEMENT",
  )
})

test("live : impossible de corriger une ligne de compensation (0150)", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await seed(-700)
  await rejectsWith(
    requestSupplierSettlementCorrection(
      f.adminId,
      f.compId!,
      null,
      "calculation_error",
      5,
      null,
      NOTE,
    ),
    "SUPPLIER_SETTLEMENT_COMPENSATION_ENTITLEMENT",
  )
})

test("live : la ligne d'origine reste réglable normalement (aucune régression)", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await seed(-700)
  const sid = await declareSupplierSettlement(
    f.adminId,
    f.nodeId,
    [
      {
        entitlementId: f.origId,
        amount: 300,
        cancellationReviewNote: NOTE,
      },
    ],
    "REF-ORIG",
    null,
  )
  await confirmSupplierSettlement(f.adminId, sid)
  assert.equal((await listUnsettledSupplierDebts(f.nodeId)).length, 0)
})
