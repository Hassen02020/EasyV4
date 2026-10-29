/**
 * VOUCHER-CAR-TRANSFER-DATA-01 (lot "transfer") — preuve d'intégration réelle
 * sous PostgreSQL / rôle `app_runtime` (non-BYPASSRLS) :
 *
 *  - `verifyManualPayment` : paiement intégral, paiement partiel, ancienne
 *    réservation sans heure enregistrée, rejeu — événement
 *    `booking/transfer.confirmed` RÉELLEMENT émis, montants / wallet / ledger
 *    inchangés par la branche transfert ;
 *  - route guest `/api/transfers/voucher/[ref]` : propriétaire, token d'une
 *    autre réservation, sans token, réservation non confirmée, ancienne
 *    réservation sans heure ;
 *  - rendu back-office `renderReservationVoucher` ;
 *  - création : une date/heure invalide est refusée avant toute écriture.
 *
 * Même technique d'interception que manual-payment-voucher-dispatch
 * .integration.test.ts (t.mock.module pour la session, monkey-patch de
 * inngest.send pour capturer l'événement).
 */

import test, { before, after } from "node:test"
import type { TestContext } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"
import { eq, sql } from "drizzle-orm"

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
import { buildTransferPickupAt } from "@/lib/transfers/pickup-at"
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

interface Session {
  authUserId: string
  role: "super_admin"
  agencyId: string
}

async function setupInterception(
  t: TestContext,
  session: Session,
): Promise<{
  verifyManualPayment: (
    input: Parameters<
      typeof import("../manual-payment-actions").verifyManualPayment
    >[0],
  ) => Promise<VerifyManualPaymentResult>
  captured: Array<{ name: string; data: unknown }>
}> {
  const captured: Array<{ name: string; data: unknown }> = []
  const originalSend = inngest.send
  inngest.send = async (payload: { name: string; data: unknown }) => {
    captured.push(payload)
    return { ids: ["test"] }
  }
  t.after(() => {
    inngest.send = originalSend
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
        role: session.role,
        agencyId: session.agencyId,
      }),
    },
  })
  const mod = await import("../manual-payment-actions")
  return { verifyManualPayment: mod.verifyManualPayment, captured }
}

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const PICKUP_AT = buildTransferPickupAt("2027-03-01", "14:30")!

interface TransferFixture {
  agencyId: string
  customerId: string
  authUserId: string
  reservationId: string
  publicRef: string
  guestAccessToken: string
}

async function createTransferFixture(
  opts: {
    tndAmount?: string
    status?: "pending" | "confirmed"
    /** false = ancienne réservation, antérieure à la migration 0143. */
    withPickupAt?: boolean
    withCustomerEmail?: boolean
  } = {},
): Promise<TransferFixture> {
  const agencyId = randomUUID()
  const customerId = randomUUID()
  const authUserId = randomUUID()
  const reservationId = randomUUID()
  const publicRef = `TST-TR-${reservationId.slice(0, 8)}`
  const guestAccessToken = randomUUID()
  const tndAmount = opts.tndAmount ?? "120.00"

  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values({
      id: agencyId,
      slug: `voucher-transfer-${agencyId.slice(0, 8)}`,
      name: "VOUCHER-CAR-TRANSFER-DATA-01 transfer — agence test",
      agencyType: "ota",
    })
    await tx.insert(customers).values({
      id: customerId,
      agencyId,
      firstName: "Test",
      lastName: "Transfert",
      email:
        opts.withCustomerEmail === false
          ? null
          : `tr-${customerId.slice(0, 8)}@example.test`,
      phone: "20000002",
    })
    await tx.insert(reservations).values({
      id: reservationId,
      agencyId,
      customerId,
      module: "transfer",
      source: "manual",
      status: opts.status ?? "pending",
      originalCurrency: "TND",
      originalAmount: tndAmount,
      tndAmount,
      publicRef,
      guestAccessToken,
    })
    await tx.insert(reservationTransfer).values({
      reservationId,
      agencyId,
      pickupAddress: "Aéroport Tunis-Carthage — Test Fixture",
      dropoffAddress: "Hammamet — Test Fixture",
      pickupAt: opts.withPickupAt === false ? null : PICKUP_AT,
      pax: 3,
      vehicleType: "van",
    })
  })

  return {
    agencyId,
    customerId,
    authUserId,
    reservationId,
    publicRef,
    guestAccessToken,
  }
}

async function cleanup(fx: TransferFixture): Promise<void> {
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

async function reservationStatus(id: string): Promise<string | undefined> {
  const [row] = await withSystemContext((tx) =>
    tx
      .select({ status: reservations.status })
      .from(reservations)
      .where(eq(reservations.id, id)),
  )
  return row?.status
}

/**
 * Lignes du grand livre rattachées à la réservation. Le chemin de paiement
 * manuel (inchangé par ce lot, identique pour tous les modules) écrit une
 * paire recharge + règlement du même montant ; la branche d'envoi du voucher
 * transfert vient APRÈS et n'en ajoute aucune.
 */
async function ledgerForReservation(
  reservationId: string,
): Promise<Array<{ type: string; amount: string }>> {
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

const EXPECTED_PAYMENT_LEDGER = [
  { type: "credit", amount: "120.00" },
  { type: "debit", amount: "120.00" },
]

/* -------------------------------------------------------------------------- */
/* verifyManualPayment                                                        */
/* -------------------------------------------------------------------------- */

test("Transfert — paiement intégral : booking/transfer.confirmed émis avec l'instant exact enregistré, montants et ledger inchangés", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const fx = await createTransferFixture()
  t.after(() => cleanup(fx))
  const { verifyManualPayment, captured } = await setupInterception(t, {
    authUserId: fx.authUserId,
    role: "super_admin",
    agencyId: fx.agencyId,
  })

  const result = await verifyManualPayment({
    reservationId: fx.reservationId,
    method: "transfer",
    reference: "TR-FULL-001",
    amountTnd: 120,
  })

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.fullyPaid, true)
  assert.equal(result.paymentState, "FULLY_PAID")

  assert.equal(captured.length, 1)
  assert.equal(captured[0]?.name, "booking/transfer.confirmed")
  const data = captured[0]?.data as Record<string, unknown>
  assert.equal(data.reservationId, fx.reservationId)
  assert.equal(data.publicRef, fx.publicRef)
  assert.equal(data.fromZone, "Aéroport Tunis-Carthage — Test Fixture")
  assert.equal(data.toZone, "Hammamet — Test Fixture")
  assert.equal(data.vehicleType, "van")
  assert.equal(data.totalTnd, 120)
  // 14:30 heure de Tunis = 13:30 UTC — l'heure saisie, pas décalée.
  assert.equal(data.pickupAt, "2027-03-01T13:30:00.000Z")
  assert.equal(
    data.customerEmail,
    `tr-${fx.customerId.slice(0, 8)}@example.test`,
  )

  assert.equal(await reservationStatus(fx.reservationId), "confirmed")

  // Invariants financiers : seule la paire de paiement existante est écrite
  // (identique au cas « ancienne réservation sans heure » ci-dessous, où la
  // branche transfert n'envoie rien), et le montant n'a pas bougé.
  assert.deepEqual(
    await ledgerForReservation(fx.reservationId),
    EXPECTED_PAYMENT_LEDGER,
  )
  const [res] = await withSystemContext((tx) =>
    tx
      .select({ tnd: reservations.tndAmount })
      .from(reservations)
      .where(eq(reservations.id, fx.reservationId)),
  )
  assert.equal(res?.tnd, "120.00")
  const pays = await withSystemContext((tx) =>
    tx
      .select({ amount: payments.tndAmount })
      .from(payments)
      .where(eq(payments.reservationId, fx.reservationId)),
  )
  assert.equal(pays.length, 1)
  assert.equal(pays[0]?.amount, "120.00")
})

test("Transfert — paiement partiel : aucun événement, réservation reste pending", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const fx = await createTransferFixture()
  t.after(() => cleanup(fx))
  const { verifyManualPayment, captured } = await setupInterception(t, {
    authUserId: fx.authUserId,
    role: "super_admin",
    agencyId: fx.agencyId,
  })

  const result = await verifyManualPayment({
    reservationId: fx.reservationId,
    method: "transfer",
    reference: "TR-PARTIAL-001",
    amountTnd: 50,
  })

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.fullyPaid, false)
  assert.equal(result.paymentState, "PARTIALLY_PAID")
  assert.equal(result.remainingTnd, 70)
  assert.equal(captured.length, 0)
  assert.equal(await reservationStatus(fx.reservationId), "pending")
})

test("Transfert — ancienne réservation sans heure enregistrée : paiement correct, aucun événement, log explicite, aucune heure inventée", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const fx = await createTransferFixture({ withPickupAt: false })
  t.after(() => cleanup(fx))
  const { verifyManualPayment, captured } = await setupInterception(t, {
    authUserId: fx.authUserId,
    role: "super_admin",
    agencyId: fx.agencyId,
  })

  const errorCalls: unknown[][] = []
  const originalError = console.error
  console.error = (...args: unknown[]) => {
    errorCalls.push(args)
  }
  t.after(() => {
    console.error = originalError
  })

  const result = await verifyManualPayment({
    reservationId: fx.reservationId,
    method: "transfer",
    reference: "TR-LEGACY-001",
    amountTnd: 120,
  })

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(
    result.fullyPaid,
    true,
    "le paiement reste financièrement correct même sans heure enregistrée",
  )
  assert.equal(await reservationStatus(fx.reservationId), "confirmed")
  assert.equal(captured.length, 0)
  assert.deepEqual(
    await ledgerForReservation(fx.reservationId),
    EXPECTED_PAYMENT_LEDGER,
    "même écriture comptable avec ou sans envoi du voucher",
  )
  assert.equal(
    errorCalls.some((args) =>
      args.some(
        (a) =>
          typeof a === "string" &&
          a.includes("booking/transfer.confirmed non envoyé"),
      ),
    ),
    true,
    "l'absence d'envoi doit être explicitement loggée",
  )
})

test("Transfert — rejeu du même paiement : refusé, un seul événement, un seul paiement", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const fx = await createTransferFixture()
  t.after(() => cleanup(fx))
  const { verifyManualPayment, captured } = await setupInterception(t, {
    authUserId: fx.authUserId,
    role: "super_admin",
    agencyId: fx.agencyId,
  })

  const input = {
    reservationId: fx.reservationId,
    method: "transfer" as const,
    reference: "TR-REPLAY-001",
    amountTnd: 120,
  }
  const first = await verifyManualPayment(input)
  assert.equal(first.ok, true)
  const second = await verifyManualPayment(input)
  assert.equal(second.ok, false, "le rejeu ne doit jamais être accepté")

  assert.equal(captured.length, 1, "un seul événement malgré le rejeu")
  const pays = await withSystemContext((tx) =>
    tx
      .select({ id: payments.id })
      .from(payments)
      .where(eq(payments.reservationId, fx.reservationId)),
  )
  assert.equal(pays.length, 1, "aucun double encaissement")
})

test("Transfert — acompte puis solde : aucun événement à l'acompte, exactement un au solde, aucun au rejeu ni au paiement ultérieur", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const fx = await createTransferFixture()
  t.after(() => cleanup(fx))
  const { verifyManualPayment, captured } = await setupInterception(t, {
    authUserId: fx.authUserId,
    role: "super_admin",
    agencyId: fx.agencyId,
  })

  // 1. Acompte : ni confirmation ni voucher.
  const deposit = await verifyManualPayment({
    reservationId: fx.reservationId,
    method: "transfer",
    reference: "TR-SEQ-DEPOSIT",
    amountTnd: 50,
  })
  assert.equal(deposit.ok && deposit.fullyPaid, false)
  assert.equal(captured.length, 0)
  assert.equal(await reservationStatus(fx.reservationId), "pending")

  // 2. Solde : confirmation + un seul événement.
  const balance = {
    reservationId: fx.reservationId,
    method: "transfer" as const,
    reference: "TR-SEQ-BALANCE",
    amountTnd: 70,
  }
  const settled = await verifyManualPayment(balance)
  assert.equal(settled.ok && settled.fullyPaid, true)
  assert.equal(captured.length, 1)
  assert.equal(captured[0]?.name, "booking/transfer.confirmed")
  assert.equal(await reservationStatus(fx.reservationId), "confirmed")

  // 3. Rejeu du même règlement : refusé, pas de second événement.
  const replay = await verifyManualPayment(balance)
  assert.equal(replay.ok, false)
  assert.equal(captured.length, 1)

  // 4. Nouveau règlement (autre référence) sur une réservation déjà
  //    confirmée : refusé, pas de second événement, pas de second voucher.
  const extra = await verifyManualPayment({
    ...balance,
    reference: "TR-SEQ-EXTRA",
  })
  assert.equal(extra.ok, false)
  assert.equal(captured.length, 1)

  // Grand livre : exactement une paire par règlement accepté (acompte + solde),
  // aucune pour les règlements refusés.
  assert.deepEqual(await ledgerForReservation(fx.reservationId), [
    { type: "credit", amount: "50.00" },
    { type: "credit", amount: "70.00" },
    { type: "debit", amount: "50.00" },
    { type: "debit", amount: "70.00" },
  ])
})

/* -------------------------------------------------------------------------- */
/* Route guest + rendu back-office                                            */
/* -------------------------------------------------------------------------- */

async function voucherReq(ref: string, token?: string) {
  const { GET } = await import("@/app/api/transfers/voucher/[ref]/route")
  const url = token
    ? `http://localhost:3000/api/transfers/voucher/${ref}?token=${token}`
    : `http://localhost:3000/api/transfers/voucher/${ref}`
  return GET(new NextRequest(url), { params: Promise.resolve({ ref }) })
}

test("voucher transfert : propriétaire (ref + token, confirmé, heure enregistrée) → 200 PDF réel", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const fx = await createTransferFixture({ status: "confirmed" })
  t.after(() => cleanup(fx))
  const res = await voucherReq(fx.publicRef, fx.guestAccessToken)
  assert.equal(res.status, 200)
  assert.equal(res.headers.get("Content-Type"), "application/pdf")
  const pdf = Buffer.from(await res.arrayBuffer())
  assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-")
  assert.ok(pdf.length > 1000)
})

test("voucher transfert : token d'UNE AUTRE réservation → 404, jamais 200", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const a = await createTransferFixture({ status: "confirmed" })
  const b = await createTransferFixture({ status: "confirmed" })
  t.after(() => cleanup(a))
  t.after(() => cleanup(b))
  const res = await voucherReq(a.publicRef, b.guestAccessToken)
  assert.equal(res.status, 404)
})

test("voucher transfert : sans token → 404", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const fx = await createTransferFixture({ status: "confirmed" })
  t.after(() => cleanup(fx))
  const res = await voucherReq(fx.publicRef)
  assert.equal(res.status, 404)
})

test("voucher transfert : réservation non confirmée → 404 voucher_unavailable", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const fx = await createTransferFixture({ status: "pending" })
  t.after(() => cleanup(fx))
  const res = await voucherReq(fx.publicRef, fx.guestAccessToken)
  assert.equal(res.status, 404)
  const body = await res.json()
  assert.equal(body.error, "voucher_unavailable")
})

test("voucher transfert : ancienne réservation confirmée sans heure → 404, aucun PDF avec une heure inventée", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const fx = await createTransferFixture({
    status: "confirmed",
    withPickupAt: false,
  })
  t.after(() => cleanup(fx))
  const res = await voucherReq(fx.publicRef, fx.guestAccessToken)
  assert.equal(res.status, 404)
  const body = await res.json()
  assert.equal(body.error, "voucher_unavailable")
})

test("rendu back-office : transfert confirmé → PDF réel ; sans heure → indisponible", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const ok = await createTransferFixture({ status: "confirmed" })
  const legacy = await createTransferFixture({
    status: "confirmed",
    withPickupAt: false,
  })
  t.after(() => cleanup(ok))
  t.after(() => cleanup(legacy))
  const { renderReservationVoucher } =
    await import("@/lib/booking/reservation-voucher-render")

  const good = await withSystemContext((tx) =>
    renderReservationVoucher(tx, ok.reservationId),
  )
  assert.equal(good.ok, true)
  if (good.ok) {
    assert.equal(
      Buffer.from(good.pdf).subarray(0, 5).toString("latin1"),
      "%PDF-",
    )
    assert.equal(good.filename, `voucher-transfert-${ok.publicRef}.pdf`)
  }

  const bad = await withSystemContext((tx) =>
    renderReservationVoucher(tx, legacy.reservationId),
  )
  assert.equal(bad.ok, false)
})

/* -------------------------------------------------------------------------- */
/* Création : date / heure invalide refusée avant toute écriture              */
/* -------------------------------------------------------------------------- */

test("création guest : heure invalide refusée avant toute écriture", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const { createGuestTransferBooking } =
    await import("@/lib/transfers/guest-booking-actions")
  const before = await withSystemContext((tx) =>
    tx.select({ n: sql<number>`count(*)::int` }).from(reservationTransfer),
  )
  const result = await createGuestTransferBooking({
    fromZoneId: randomUUID(),
    toZoneId: randomUUID(),
    vehicleType: "sedan",
    pickupDate: "2027-02-30",
    pickupTime: "25:99",
    pax: 2,
    customer: {
      firstName: "A",
      lastName: "B",
      phone: "20000000",
      email: "x@example.test",
    },
  } as Parameters<typeof createGuestTransferBooking>[0])
  assert.equal(result.ok, false)
  const after = await withSystemContext((tx) =>
    tx.select({ n: sql<number>`count(*)::int` }).from(reservationTransfer),
  )
  assert.equal(after[0]?.n, before[0]?.n)
})

after(() => {
  /* rien : chaque test nettoie ses propres lignes via t.after() */
})
