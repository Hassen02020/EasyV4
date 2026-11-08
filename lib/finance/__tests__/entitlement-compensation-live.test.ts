/**
 * CANCEL-FINANCIAL-COHERENCE-01, étape 2b — preuve sur PostgreSQL réel
 * (rôle app_runtime, mêmes fonctions SECURITY DEFINER que la production) :
 *  - T4-D2 = B : droits 'pending' à la création d'une réservation non
 *    confirmée, 'earned' à la confirmation (mark_entitlements_earned, 0151) ;
 *  - D-02a / T4-D1 = B : annulation gratuite → tout est compensé (net 0) ;
 *  - D2b-2 : annulation avec frais F où Easy2Book garde sa part → le vendeur
 *    la supporte, net total = F ;
 *  - D2b-1 = A : frais inconnus → aucune compensation, trace « à traiter » ;
 *  - rejeu sans doublon ; droits jamais confirmés → rien à compenser ;
 *  - règlement fournisseur : un droit 'pending' n'est pas une dette.
 */
import test, { before } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { and, eq, sql } from "drizzle-orm"
import { withSystemContext, withTenantContext } from "@/lib/db/tenant-context"
import {
  agencies,
  auditEvents,
  customers,
  economicEntitlements,
  reservations,
  supplierNodes,
  suppliers,
} from "@/lib/db/schema"
import { recordReservationFinancials } from "../reservation-financials"
import { recordReservationTransition } from "@/lib/admin/reservation-status-history"
import {
  compensateEntitlementsOnCancellation,
  compensationAmount,
  easy2bookKeepsShare,
} from "../entitlement-compensation"
import { listUnsettledSupplierDebts } from "../supplier-settlement"

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

type Status = "pending" | "confirmed"

/**
 * Agence + nœud fournisseur + réservation (1000 TND) + droits écrits par
 * recordReservationFinancials (fournisseur 800, vendeur 150, Easy2Book 50
 * non_refundable), sous contexte agence comme les vrais parcours.
 */
async function seed(status: Status) {
  const s = randomUUID().slice(0, 8)
  const ids = await withSystemContext(async (tx) => {
    const [agency] = await tx
      .insert(agencies)
      .values({ name: `2b ${s}`, agencyType: "ota", slug: `cfc2b-${s}` })
      .returning({ id: agencies.id })
    const [customer] = await tx
      .insert(customers)
      .values({ agencyId: agency!.id, firstName: "2b", lastName: s })
      .returning({ id: customers.id })
    const [supplier] = await tx
      .insert(suppliers)
      .values({ name: `2b ${s}`, type: "custom", status: "active" })
      .returning({ id: suppliers.id })
    const [node] = await tx
      .insert(supplierNodes)
      .values({
        supplierId: supplier!.id,
        slug: `cfc2b-${s}`,
        displayName: `2b ${s}`,
        onboardingStatus: "active",
      })
      .returning({ id: supplierNodes.id })
    const [res] = await tx
      .insert(reservations)
      .values({
        agencyId: agency!.id,
        publicRef: `CFC2B-${s}`,
        customerId: customer!.id,
        module: "network",
        source: "manual",
        status,
        originalCurrency: "TND",
        originalAmount: "1000.00",
        tndAmount: "1000.00",
      })
      .returning({ id: reservations.id, publicRef: reservations.publicRef })
    return {
      agencyId: agency!.id,
      nodeId: node!.id,
      reservationId: res!.id,
      publicRef: res!.publicRef,
    }
  })
  await withTenantContext(
    { agencyId: ids.agencyId, userId: "", isSuperAdmin: false },
    (tx) =>
      recordReservationFinancials({
        tx,
        reservationId: ids.reservationId,
        supplierPriceTnd: 800,
        salePriceTnd: 1000,
        commissionPercent: 25,
        economicEntitlements: [
          {
            partyType: "supplier_node",
            partyId: ids.nodeId,
            role: "supplier",
            qualification: "supplier_cost",
            amount: 800,
            basis: "coût fournisseur",
          },
          {
            partyType: "agency",
            partyId: ids.agencyId,
            role: "seller",
            qualification: "seller_margin",
            amount: 150,
            basis: "marge vendeur",
          },
          {
            partyType: "easy2book",
            partyId: null,
            role: "easy2book",
            qualification: "commission",
            amount: 50,
            basis: "commission",
            cancellationTreatment: "non_refundable",
          },
        ],
      }),
  )
  return ids
}

async function lines(reservationId: string) {
  return withSystemContext((tx) =>
    tx
      .select()
      .from(economicEntitlements)
      .where(eq(economicEntitlements.reservationId, reservationId)),
  )
}

const amt = (v: string) => Number.parseFloat(v)
const total = (rows: { amount: string }[]) =>
  Math.round(rows.reduce((s, r) => s + amt(r.amount), 0) * 100) / 100

async function compensate(
  f: { reservationId: string; publicRef: string },
  supplierFeeTnd: number | null,
) {
  return withSystemContext((tx) =>
    compensateEntitlementsOnCancellation(tx, {
      reservationId: f.reservationId,
      supplierFeeTnd,
      publicRef: f.publicRef,
      actorUserId: null,
      reason: "test 2b",
    }),
  )
}

/** Simule la part Easy2Book telle que reverseCommissionOnCancellation l'écrit (non_refundable → 0). */
async function e2bKeptTrace(reservationId: string) {
  await withSystemContext(async (tx) => {
    const [orig] = await tx
      .select({ id: economicEntitlements.id })
      .from(economicEntitlements)
      .where(
        and(
          eq(economicEntitlements.reservationId, reservationId),
          eq(economicEntitlements.role, "easy2book"),
        ),
      )
    await tx.execute(sql`
      INSERT INTO economic_entitlements (reservation_id, party_type, role,
        qualification, amount, currency, basis, status, effective_at,
        compensates_id, cancellation_treatment)
      VALUES (${reservationId}, 'easy2book', 'easy2book', 'commission', '0.00',
        'TND', 'trace test', 'pending', now(), ${orig!.id}, 'non_refundable')`)
  })
}

// ─── Calcul pur ────────────────────────────────────────────────────────────

test("calcul : montants de compensation par rôle", () => {
  assert.equal(easy2bookKeepsShare(0, "non_refundable"), false)
  assert.equal(easy2bookKeepsShare(100, "non_refundable"), true)
  assert.equal(easy2bookKeepsShare(100, "full_reversal"), false)
  const ctx = { supplierFeeTnd: 100, e2bKeptTnd: 50 }
  assert.equal(compensationAmount({ role: "supplier", amount: 800 }, ctx), -700)
  assert.equal(compensationAmount({ role: "seller", amount: 150 }, ctx), -200)
  assert.equal(compensationAmount({ role: "partner", amount: 30 }, ctx), -30)
  // Frais supérieurs au droit fournisseur : il ne garde jamais plus que son droit.
  assert.equal(
    compensationAmount(
      { role: "supplier", amount: 800 },
      { supplierFeeTnd: 900, e2bKeptTnd: 0 },
    ),
    0,
  )
  // Gratuit : tout est compensé.
  assert.equal(
    compensationAmount(
      { role: "supplier", amount: 800 },
      { supplierFeeTnd: 0, e2bKeptTnd: 0 },
    ),
    -800,
  )
})

// ─── Statut à la création / confirmation ──────────────────────────────────

test("live : réservation non confirmée → droits 'pending' ; confirmation → 'earned'", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await seed("pending")
  let rows = await lines(f.reservationId)
  assert.equal(rows.length, 3)
  assert.ok(rows.every((r) => r.status === "pending"))

  await withSystemContext((tx) =>
    recordReservationTransition(tx, {
      reservationId: f.reservationId,
      from: "pending",
      to: "confirmed",
      automated: true,
    }),
  )
  rows = await lines(f.reservationId)
  assert.ok(
    rows.every((r) => r.status === "earned"),
    rows.map((r) => r.status).join(","),
  )
})

test("live : réservation déjà confirmée → droits 'earned' dès la création", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await seed("confirmed")
  const rows = await lines(f.reservationId)
  assert.ok(rows.every((r) => r.status === "earned"))
})

test("live : mark_entitlements_earned ne touche jamais une ligne de compensation", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await seed("confirmed")
  await compensate(f, 0)
  await withSystemContext((tx) =>
    tx.execute(sql`SELECT mark_entitlements_earned(${f.reservationId}::uuid)`),
  )
  const comps = (await lines(f.reservationId)).filter((r) => r.compensatesId)
  assert.ok(comps.length > 0)
  assert.ok(comps.every((r) => r.status === "compensated"))
})

test("live : app_runtime ne peut toujours pas modifier un droit directement (append-only)", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await seed("pending")
  await assert.rejects(
    withSystemContext((tx) =>
      tx.execute(
        sql`UPDATE economic_entitlements SET status = 'earned' WHERE reservation_id = ${f.reservationId}`,
      ),
    ),
  )
})

// ─── Compensation ──────────────────────────────────────────────────────────

test("live : annulation gratuite → tout est compensé, net 0 (hors Easy2Book, géré par le reversement)", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await seed("confirmed")
  const r = await compensate(f, 0)
  assert.deepEqual(r, { outcome: "compensated", lines: 2 })
  const rows = await lines(f.reservationId)
  const nonE2b = rows.filter((l) => l.role !== "easy2book")
  assert.equal(total(nonE2b), 0)
  const sup = rows.find((l) => l.role === "supplier" && l.compensatesId)
  assert.equal(amt(sup!.amount), -800)
  assert.equal(sup!.status, "compensated")
  // Lignes d'origine inchangées.
  const orig = rows.filter((l) => !l.compensatesId)
  assert.ok(orig.every((l) => l.status === "earned"))
})

test("live : annulation avec frais 100, part Easy2Book conservée → vendeur la supporte, net total = frais", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await seed("confirmed")
  await e2bKeptTrace(f.reservationId)
  const r = await compensate(f, 100)
  assert.deepEqual(r, { outcome: "compensated", lines: 2 })
  const rows = await lines(f.reservationId)
  const comp = (role: string) =>
    amt(rows.find((l) => l.role === role && l.compensatesId)!.amount)
  assert.equal(comp("supplier"), -700)
  assert.equal(comp("seller"), -200)
  assert.equal(comp("easy2book"), 0)
  // Net : fournisseur 100, vendeur −50, Easy2Book 50 → 100 = frais retenus.
  assert.equal(total(rows), 100)
})

test("live : rejeu → aucune ligne en double", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await seed("confirmed")
  await compensate(f, 0)
  const again = await compensate(f, 0)
  assert.deepEqual(again, { outcome: "compensated", lines: 0 })
  const rows = await lines(f.reservationId)
  assert.equal(rows.filter((l) => l.compensatesId).length, 2)
})

test("live : réservation jamais confirmée (pending/expirée) → rien à compenser", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await seed("pending")
  const r = await compensate(f, 0)
  assert.deepEqual(r, { outcome: "nothing_earned" })
  assert.equal((await lines(f.reservationId)).length, 3)
})

test("live : frais inconnus → aucune compensation, trace d'audit « à traiter »", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await seed("confirmed")
  const r = await compensate(f, null)
  assert.deepEqual(r, { outcome: "fee_unknown_flagged" })
  assert.equal(
    (await lines(f.reservationId)).filter((l) => l.compensatesId).length,
    0,
  )
  const audits = await withSystemContext((tx) =>
    tx
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.entityId, f.reservationId),
          eq(auditEvents.action, "entitlements.to_compensate"),
        ),
      ),
  )
  assert.equal(audits.length, 1)
  assert.equal(audits[0]!.agencyId, f.agencyId)
})

// ─── Règlement fournisseur ────────────────────────────────────────────────

test("live : liste des dettes fournisseur — 'pending' exclu, 'earned' listé, compensé gratuit → plus de dette", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await seed("pending")
  assert.equal((await listUnsettledSupplierDebts(f.nodeId)).length, 0)

  await withSystemContext((tx) =>
    recordReservationTransition(tx, {
      reservationId: f.reservationId,
      from: "pending",
      to: "confirmed",
      automated: true,
    }),
  )
  const debts = await listUnsettledSupplierDebts(f.nodeId)
  assert.equal(debts.length, 1)
  assert.equal(Number(debts[0]!.remaining), 800)

  await compensate(f, 0)
  assert.equal((await listUnsettledSupplierDebts(f.nodeId)).length, 0)
})

test("live : frais 100 → dette fournisseur résiduelle = 100", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await seed("confirmed")
  await compensate(f, 100)
  const debts = await listUnsettledSupplierDebts(f.nodeId)
  assert.equal(debts.length, 1)
  assert.equal(Number(debts[0]!.remaining), 100)
})

test("live : remboursement après annulation déjà compensée → ni doublon, ni trace « à traiter »", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await seed("confirmed")
  await compensate(f, 0)
  const r = await compensate(f, null)
  assert.deepEqual(r, { outcome: "compensated", lines: 0 })
  assert.equal(
    (await lines(f.reservationId)).filter((l) => l.compensatesId).length,
    2,
  )
  const audits = await withSystemContext((tx) =>
    tx
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.entityId, f.reservationId),
          eq(auditEvents.action, "entitlements.to_compensate"),
        ),
      ),
  )
  assert.equal(audits.length, 0)
})
