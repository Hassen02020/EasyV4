/**
 * INNGEST-RELIABILITY-01 — preuve d'intégration réelle (PostgreSQL, rôle
 * `app_runtime` non-BYPASSRLS) : une panne Inngest au moment de la
 * confirmation d'un paiement manuel ne perd plus l'événement en silence et
 * n'invalide jamais le paiement.
 *
 *  - Inngest en panne + paiement intégral : le paiement, la confirmation, la
 *    facture et la paire de lignes du ledger restent corrects ; l'événement
 *    est tracé dans audit_events (`inngest.dispatch_failed`) avec sa charge
 *    utile complète, l'id stable et l'agence ;
 *  - Inngest en panne + acompte : aucun envoi tenté, donc aucune trace ;
 *  - Inngest rétabli : un envoi réussi ne laisse aucune trace ;
 *  - rejeu du règlement : refusé, aucune seconde trace.
 *
 * Même technique d'interception que manual-payment-transfer-voucher
 * .integration.test.ts (t.mock.module pour la session, monkey-patch de
 * inngest.send).
 */

import test, { before } from "node:test"
import type { TestContext } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { and, eq, sql } from "drizzle-orm"

import { withSystemContext } from "@/lib/db/tenant-context"
import {
  agencies,
  auditEvents,
  customers,
  partnerInvoices,
  payments,
  reservationStatusHistory,
  reservationTransfer,
  reservations,
  walletLedger,
} from "@/lib/db/schema"
import { inngest } from "@/lib/inngest/client"
import { INNGEST_DISPATCH_FAILED_ACTION } from "@/lib/inngest/send-reliable"
import type { VerifyManualPaymentResult } from "../manual-payment-actions"

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
const skip = () =>
  "Postgres local indisponible (DATABASE_URL) — voir commission-reversal-integration.test.ts pour la procédure."

before(async () => {
  dbAvailable = await isDbAvailable()
})

async function setup(
  t: TestContext,
  session: { authUserId: string; agencyId: string },
  opts: { inngestDown: boolean },
): Promise<{
  verifyManualPayment: (
    input: Parameters<
      typeof import("../manual-payment-actions").verifyManualPayment
    >[0],
  ) => Promise<VerifyManualPaymentResult>
  attempts: { n: number }
}> {
  const attempts = { n: 0 }
  const originalSend = inngest.send
  inngest.send = (async () => {
    attempts.n++
    if (opts.inngestDown) throw new Error("Inngest indisponible (simulé)")
    return { ids: ["test"] }
  }) as typeof inngest.send
  t.after(() => {
    inngest.send = originalSend
  })
  // Le backoff réel (100 + 200 ms) est conservé : preuve du comportement
  // de production, coût négligeable.
  const errorLines: string[] = []
  const originalError = console.error
  console.error = (...args: unknown[]) => {
    errorLines.push(args.map(String).join(" "))
  }
  t.after(() => {
    console.error = originalError
  })

  t.mock.module("@/lib/supabase/server", {
    namedExports: {
      createServerSupabase: async () => ({
        auth: {
          getUser: async () => ({ data: { user: { id: session.authUserId } } }),
        },
      }),
    },
  })
  t.mock.module("@/lib/auth/profile", {
    namedExports: {
      getCurrentAdminProfile: async () => ({
        role: "super_admin",
        agencyId: session.agencyId,
      }),
    },
  })
  const mod = await import("../manual-payment-actions")
  return { verifyManualPayment: mod.verifyManualPayment, attempts }
}

interface Fx {
  agencyId: string
  customerId: string
  authUserId: string
  reservationId: string
  publicRef: string
}

async function createFx(): Promise<Fx> {
  const agencyId = randomUUID()
  const customerId = randomUUID()
  const reservationId = randomUUID()
  const publicRef = `TST-IR-${reservationId.slice(0, 8)}`
  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values({
      id: agencyId,
      slug: `inngest-rel-${agencyId.slice(0, 8)}`,
      name: "INNGEST-RELIABILITY-01 — agence test",
      agencyType: "ota",
    })
    await tx.insert(customers).values({
      id: customerId,
      agencyId,
      firstName: "Test",
      lastName: "Fiabilite",
      email: `ir-${customerId.slice(0, 8)}@example.test`,
      phone: "20000003",
    })
    await tx.insert(reservations).values({
      id: reservationId,
      agencyId,
      customerId,
      module: "transfer",
      source: "manual",
      status: "pending",
      originalCurrency: "TND",
      originalAmount: "120.00",
      tndAmount: "120.00",
      publicRef,
      guestAccessToken: randomUUID(),
    })
    await tx.insert(reservationTransfer).values({
      reservationId,
      agencyId,
      pickupAddress: "Aéroport — Test Fixture",
      dropoffAddress: "Hammamet — Test Fixture",
      pickupAt: new Date("2027-03-01T13:30:00.000Z"),
      pax: 2,
      vehicleType: "van",
    })
  })
  return {
    agencyId,
    customerId,
    authUserId: randomUUID(),
    reservationId,
    publicRef,
  }
}

async function cleanup(fx: Fx): Promise<void> {
  await withSystemContext(async (tx) => {
    await tx
      .delete(partnerInvoices)
      .where(eq(partnerInvoices.reservationId, fx.reservationId))
    await tx
      .delete(payments)
      .where(eq(payments.reservationId, fx.reservationId))
    await tx
      .delete(auditEvents)
      .where(eq(auditEvents.entityId, fx.reservationId))
    await tx
      .delete(reservationStatusHistory)
      .where(eq(reservationStatusHistory.reservationId, fx.reservationId))
    await tx.delete(reservations).where(eq(reservations.id, fx.reservationId))
    await tx.delete(customers).where(eq(customers.id, fx.customerId))
    await tx.delete(agencies).where(eq(agencies.id, fx.agencyId))
  })
}

async function failedTraces(reservationId: string) {
  return withSystemContext((tx) =>
    tx
      .select({
        agencyId: auditEvents.agencyId,
        entityType: auditEvents.entityType,
        diff: auditEvents.diff,
      })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.entityId, reservationId),
          eq(auditEvents.action, INNGEST_DISPATCH_FAILED_ACTION),
        ),
      ),
  )
}

async function status(id: string) {
  const [row] = await withSystemContext((tx) =>
    tx
      .select({ status: reservations.status })
      .from(reservations)
      .where(eq(reservations.id, id)),
  )
  return row?.status
}

async function ledger(reservationId: string) {
  const rows = await withSystemContext((tx) =>
    tx
      .select({ type: walletLedger.type, amount: walletLedger.amount })
      .from(walletLedger)
      .where(eq(walletLedger.reservationId, reservationId)),
  )
  return rows
    .map((r) => ({ type: String(r.type), amount: r.amount }))
    .sort((a, b) => a.type.localeCompare(b.type))
}

test("Inngest en panne + paiement intégral : paiement, confirmation, facture et ledger corrects ; événement tracé avec sa charge utile", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const fx = await createFx()
  t.after(() => cleanup(fx))
  const { verifyManualPayment, attempts } = await setup(t, fx, {
    inngestDown: true,
  })

  const result = await verifyManualPayment({
    reservationId: fx.reservationId,
    method: "transfer",
    reference: "IR-FULL-001",
    amountTnd: 120,
  })

  // Le paiement n'est PAS invalidé par la panne de notification.
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.fullyPaid, true)
  assert.equal(await status(fx.reservationId), "confirmed")
  assert.deepEqual(await ledger(fx.reservationId), [
    { type: "credit", amount: "120.00" },
    { type: "debit", amount: "120.00" },
  ])
  const invoices = await withSystemContext((tx) =>
    tx
      .select({ id: partnerInvoices.id })
      .from(partnerInvoices)
      .where(eq(partnerInvoices.reservationId, fx.reservationId)),
  )
  assert.equal(invoices.length, 1)

  // 3 tentatives réelles, puis trace durable.
  assert.equal(attempts.n, 3)
  const traces = await failedTraces(fx.reservationId)
  assert.equal(traces.length, 1)
  const trace = traces[0]!
  assert.equal(trace.agencyId, fx.agencyId)
  assert.equal(trace.entityType, "reservation")
  const diff = trace.diff as Record<string, unknown>
  assert.equal(diff.eventName, "booking/transfer.confirmed")
  assert.equal(diff.eventId, `booking/transfer.confirmed:${fx.reservationId}`)
  assert.equal(diff.attempts, 3)
  assert.match(String(diff.error), /Inngest indisponible/)
  const payload = diff.payload as Record<string, unknown>
  assert.equal(payload.reservationId, fx.reservationId)
  assert.equal(payload.pickupAt, "2027-03-01T13:30:00.000Z")
  assert.equal(payload.totalTnd, 120)
})

test("Inngest en panne + acompte : aucun envoi tenté, aucune trace, réservation reste pending", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const fx = await createFx()
  t.after(() => cleanup(fx))
  const { verifyManualPayment, attempts } = await setup(t, fx, {
    inngestDown: true,
  })

  const result = await verifyManualPayment({
    reservationId: fx.reservationId,
    method: "transfer",
    reference: "IR-PARTIAL-001",
    amountTnd: 50,
  })
  assert.equal(result.ok && result.fullyPaid, false)
  assert.equal(attempts.n, 0)
  assert.equal((await failedTraces(fx.reservationId)).length, 0)
  assert.equal(await status(fx.reservationId), "pending")
})

test("Inngest disponible : envoi réussi dès le premier essai, aucune trace", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const fx = await createFx()
  t.after(() => cleanup(fx))
  const { verifyManualPayment, attempts } = await setup(t, fx, {
    inngestDown: false,
  })

  const result = await verifyManualPayment({
    reservationId: fx.reservationId,
    method: "transfer",
    reference: "IR-OK-001",
    amountTnd: 120,
  })
  assert.equal(result.ok && result.fullyPaid, true)
  assert.equal(attempts.n, 1)
  assert.equal((await failedTraces(fx.reservationId)).length, 0)
})

test("Inngest en panne + rejeu du règlement : refusé, une seule trace", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const fx = await createFx()
  t.after(() => cleanup(fx))
  const { verifyManualPayment } = await setup(t, fx, { inngestDown: true })

  const input = {
    reservationId: fx.reservationId,
    method: "transfer" as const,
    reference: "IR-REPLAY-001",
    amountTnd: 120,
  }
  assert.equal((await verifyManualPayment(input)).ok, true)
  assert.equal((await verifyManualPayment(input)).ok, false)
  assert.equal((await failedTraces(fx.reservationId)).length, 1)
})
