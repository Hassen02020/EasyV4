/**
 * CAR-EMAIL-IDEMPOTENCY-01 — preuve d'intégration réelle (PostgreSQL) de la
 * garde d'envoi unique des emails de voucher voiture et vol.
 *
 * Défaut corrigé : les noms d'action (35 et 38 caractères) dépassaient
 * `audit_events.action` (varchar 32) ; l'enregistrement de l'envoi échouait,
 * le marqueur anti-doublon n'était jamais posé et chaque nouvelle tentative
 * Inngest renvoyait l'email au client.
 */
import test, { before } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"

import { withSystemContext } from "@/lib/db/tenant-context"
import { agencies, auditEvents } from "@/lib/db/schema"
import { pgErrorCode } from "@/lib/db/pg-error"
import {
  ACTION_CAR_VOUCHER_SENT,
  hasCarVoucherAlreadySent,
  recordCarVoucherSent,
} from "../process-car-confirmed"
import {
  ACTION_FLIGHT_VOUCHER_SENT,
  hasFlightVoucherAlreadySent,
  recordFlightVoucherSent,
} from "../process-flight-confirmed"

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

async function agencyFixture(): Promise<string> {
  const agencyId = randomUUID()
  await withSystemContext((tx) =>
    tx.insert(agencies).values({
      id: agencyId,
      slug: `cf-mail-${agencyId.slice(0, 8)}`,
      name: "CAR-EMAIL-IDEMPOTENCY-01 — agence test",
      agencyType: "ota",
    }),
  )
  return agencyId
}

/** `audit_events.agency_id` est ON DELETE RESTRICT : ses lignes d'abord. */
async function cleanupAgency(agencyId: string): Promise<void> {
  await withSystemContext(async (tx) => {
    await tx.delete(auditEvents).where(eq(auditEvents.agencyId, agencyId))
    await tx.delete(agencies).where(eq(agencies.id, agencyId))
  })
}

test("noms d'action ≤ 32 caractères (audit_events.action varchar 32)", () => {
  assert.ok(ACTION_CAR_VOUCHER_SENT.length <= 32, ACTION_CAR_VOUCHER_SENT)
  assert.ok(ACTION_FLIGHT_VOUCHER_SENT.length <= 32, ACTION_FLIGHT_VOUCHER_SENT)
})

test("voiture : envoi enregistré, puis reconnu comme déjà envoyé", async (t) => {
  if (!dbAvailable) return t.skip(skip())
  const agencyId = await agencyFixture()
  try {
    const reservationId = randomUUID()
    assert.equal(await hasCarVoucherAlreadySent(reservationId), false)
    await recordCarVoucherSent(agencyId, reservationId, "CAR-TEST-1")
    assert.equal(await hasCarVoucherAlreadySent(reservationId), true)
    // Deuxième passage (retry Inngest) : aucune erreur, aucun doublon fatal.
    await recordCarVoucherSent(agencyId, reservationId, "CAR-TEST-1")
    assert.equal(await hasCarVoucherAlreadySent(reservationId), true)
  } finally {
    await cleanupAgency(agencyId)
  }
})

test("vol : envoi enregistré, puis reconnu comme déjà envoyé", async (t) => {
  if (!dbAvailable) return t.skip(skip())
  const agencyId = await agencyFixture()
  try {
    const reservationId = randomUUID()
    assert.equal(await hasFlightVoucherAlreadySent(reservationId), false)
    await recordFlightVoucherSent(agencyId, reservationId, "FL-TEST-1")
    assert.equal(await hasFlightVoucherAlreadySent(reservationId), true)
    await recordFlightVoucherSent(agencyId, reservationId, "FL-TEST-1")
    assert.equal(await hasFlightVoucherAlreadySent(reservationId), true)
  } finally {
    await cleanupAgency(agencyId)
  }
})

test("contrôle : l'ancien nom (35 car.) est bien refusé par la base", async (t) => {
  if (!dbAvailable) return t.skip(skip())
  const agencyId = await agencyFixture()
  try {
    await assert.rejects(
      withSystemContext((tx) =>
        tx.insert(auditEvents).values({
          agencyId,
          entityType: "reservation",
          entityId: randomUUID(),
          action: "notification.car_voucher_email.sent",
          diff: {},
        }),
      ),
      (err: unknown) => pgErrorCode(err) === "22001",
    )
  } finally {
    await cleanupAgency(agencyId)
  }
})
