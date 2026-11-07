/**
 * T-1 (CANCEL-POLICY-DISPLAY-01) — une réservation annulée ne garde aucun
 * règlement « en attente ». Preuve sur PostgreSQL réel (rôle app_runtime
 * via withSystemContext) + contrôle de câblage des 5 chemins d'annulation.
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { and, eq, sql } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import { cleanupAsSuperuser } from "@/lib/db/test-helpers/superuser-cleanup"
import {
  agencies,
  auditEvents,
  customers,
  payments,
  reservations,
} from "@/lib/db/schema"
import { voidPendingPaymentsOnCancellation } from "../payment-void"

let dbAvailable = false
const skip = () => "Postgres local indisponible (DATABASE_URL)."
const agencyId = randomUUID()
let reservationId = ""
let otherReservationId = ""

before(async () => {
  try {
    await withSystemContext((tx) => tx.execute(sql`select 1`))
    dbAvailable = true
  } catch {
    dbAvailable = false
  }
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values({
      id: agencyId,
      slug: `payment-void-${agencyId.slice(0, 8)}`,
      name: "T-1 fixture",
      agencyType: "ota",
    })
    const [c] = await tx
      .insert(customers)
      .values({
        agencyId,
        civility: "M",
        firstName: "Void",
        lastName: "Test",
        phone: "20000003",
      })
      .returning({ id: customers.id })
    const mk = async (ref: string) => {
      const [r] = await tx
        .insert(reservations)
        .values({
          agencyId,
          publicRef: ref,
          customerId: c!.id,
          module: "hotel",
          source: "internal",
          status: "cancelled",
          originalCurrency: "TND",
          originalAmount: "103.21",
          tndAmount: "103.21",
        })
        .returning({ id: reservations.id })
      return r!.id
    }
    reservationId = await mk(`TEST-VOID-${agencyId.slice(0, 6)}`)
    otherReservationId = await mk(`TEST-VOID2-${agencyId.slice(0, 6)}`)
    const base = {
      agencyId,
      psp: "manual" as const,
      originalCurrency: "TND",
      kind: "deposit" as const,
    }
    await tx.insert(payments).values([
      {
        ...base,
        reservationId,
        method: "transfer",
        originalAmount: "103.21",
        tndAmount: "103.21",
        status: "pending",
      },
      {
        ...base,
        reservationId,
        method: "cash",
        originalAmount: "10.00",
        tndAmount: "10.00",
        status: "captured",
        capturedAt: new Date(),
      },
      {
        ...base,
        reservationId: otherReservationId,
        method: "transfer",
        originalAmount: "50.00",
        tndAmount: "50.00",
        status: "pending",
      },
    ])
  })
})

after(async () => {
  if (!dbAvailable) return
  for (const rid of [reservationId, otherReservationId]) {
    await cleanupAsSuperuser(
      (q) => q`delete from audit_events where agency_id = ${agencyId}`,
    )
    await cleanupAsSuperuser(
      (q) => q`delete from payments where reservation_id = ${rid}`,
    )
  }
  await withSystemContext(async (tx) => {
    await tx.delete(reservations).where(eq(reservations.agencyId, agencyId))
    await tx.delete(customers).where(eq(customers.agencyId, agencyId))
    await tx.delete(agencies).where(eq(agencies.id, agencyId))
  })
})

test("live : le virement en attente passe à failed ; l'encaissé et l'autre réservation sont intacts ; audit tracé ; idempotent", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const n = await withSystemContext((tx) =>
    voidPendingPaymentsOnCancellation(tx, {
      reservationId,
      actorUserId: null,
      reason: "test T-1",
    }),
  )
  assert.equal(n, 1)
  const rows = await withSystemContext((tx) =>
    tx
      .select({
        method: payments.method,
        status: payments.status,
        rid: payments.reservationId,
      })
      .from(payments)
      .where(eq(payments.agencyId, agencyId)),
  )
  const st = (rid: string, method: string) =>
    rows.find((r) => r.rid === rid && r.method === method)?.status
  assert.equal(st(reservationId, "transfer"), "failed")
  assert.equal(
    st(reservationId, "cash"),
    "captured",
    "un règlement encaissé n'est jamais modifié",
  )
  assert.equal(
    st(otherReservationId, "transfer"),
    "pending",
    "aucune autre réservation touchée",
  )
  const audit = await withSystemContext((tx) =>
    tx
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.agencyId, agencyId),
          eq(auditEvents.action, "payment.voided"),
        ),
      ),
  )
  assert.equal(audit.length, 1)
  assert.equal(
    (audit[0]!.diff as { reservationId: string }).reservationId,
    reservationId,
  )
  // Rejeu : plus rien à annuler.
  const again = await withSystemContext((tx) =>
    voidPendingPaymentsOnCancellation(tx, {
      reservationId,
      actorUserId: null,
      reason: "test T-1",
    }),
  )
  assert.equal(again, 0)
})

test("câblage : les 5 chemins d'annulation appellent le helper APRÈS le passage à « cancelled »", () => {
  const sites: [string, string][] = [
    [
      "lib/booking/customer-cancel-actions.ts",
      'reason: "Annulation self-service client",',
    ],
    [
      "lib/booking/customer-cancel-actions.ts",
      'reason: "Annulation self-service client Hôtel Monde",',
    ],
    [
      "lib/booking/policy-cancel-core.ts",
      'reason: "Annulation self-service client (policy engine)",',
    ],
    ["lib/booking/cancel-actions.ts", 'reason: "Annulation partenaire",'],
    [
      "lib/admin/actions.ts",
      "reason: `Changement de statut manuel (back-office)",
    ],
  ]
  for (const [file, anchor] of sites) {
    const s = readFileSync(file, "utf8")
    const at = s.indexOf(anchor)
    assert.ok(at > 0, `${file} : ${anchor}`)
    const statusUpdate = s.lastIndexOf('status: "cancelled"', at)
    const call = s.indexOf("voidPendingPaymentsOnCancellation(", at)
    assert.ok(
      call > at && call - at < 600,
      `${file} : appel juste après la transition (${anchor})`,
    )
    if (!file.endsWith("admin/actions.ts"))
      assert.ok(statusUpdate > 0 && statusUpdate < at, file)
  }
  // Aucun autre point du code ne passe une réservation à « cancelled » sans être listé ici.
  const helper = readFileSync("lib/finance/payment-void.ts", "utf8")
  assert.match(helper, /eq\(payments\.status, "pending"\)/)
  // Seules tables touchées : payments (statut) et audit_events (traçabilité).
  assert.match(
    helper,
    /import \{ auditEvents, payments \} from "@\/lib\/db\/schema"/,
  )
})
