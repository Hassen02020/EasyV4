/**
 * TRANSFER-EMAIL-IDEMPOTENCY-01 — preuve d'intégration réelle (PostgreSQL,
 * rôle `app_runtime` non-BYPASSRLS) de la garde d'envoi unique : seule
 * l'émission de l'email (Resend) est simulée ; la garde
 * (`notification_idempotency` + trace `audit_events`) utilise la vraie base.
 *
 * Prouve en particulier que l'action d'idempotence tient dans
 * `audit_events.action` (varchar 32) : l'enregistrement de l'envoi réussit,
 * contrairement au défaut du handler voiture (action de 35 caractères).
 */
import test, { before } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { and, eq, sql } from "drizzle-orm"

import { withSystemContext } from "@/lib/db/tenant-context"
import { agencies, auditEvents, notificationIdempotency } from "@/lib/db/schema"
import type { Events } from "@/lib/inngest/client"
import {
  sendTransferEmailOnce,
  TRANSFER_EMAIL_SENT_ACTION,
} from "../process-transfer-confirmed"

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
      slug: `tr-mail-${agencyId.slice(0, 8)}`,
      name: "TRANSFER-EMAIL-IDEMPOTENCY-01 — agence test",
      agencyType: "ota",
    }),
  )
  return agencyId
}

/**
 * `audit_events.agency_id` est ON DELETE RESTRICT : ses lignes d'abord ;
 * `notification_idempotency` (en ajout seul) part en cascade avec l'agence.
 */
async function cleanupAgency(agencyId: string): Promise<void> {
  await withSystemContext(async (tx) => {
    await tx.delete(auditEvents).where(eq(auditEvents.agencyId, agencyId))
    await tx.delete(agencies).where(eq(agencies.id, agencyId))
  })
}

function event(
  agencyId: string,
  reservationId: string,
): Events["booking/transfer.confirmed"]["data"] {
  return {
    reservationId,
    publicRef: `TR-2026-${reservationId.slice(0, 6)}`,
    agencyId,
    customerEmail: "reservation@easy2book.tn",
    customerPhone: "20000000",
    fromZone: "Aéroport Tunis-Carthage",
    toZone: "Hammamet",
    pickupAt: "2027-03-01T13:30:00.000Z",
    vehicleType: "van",
    totalTnd: 120,
  }
}

async function rows(reservationId: string) {
  const guard = await withSystemContext((tx) =>
    tx
      .select({ id: notificationIdempotency.id })
      .from(notificationIdempotency)
      .where(
        and(
          eq(notificationIdempotency.reservationId, reservationId),
          eq(notificationIdempotency.action, TRANSFER_EMAIL_SENT_ACTION),
        ),
      ),
  )
  const audit = await withSystemContext((tx) =>
    tx
      .select({ id: auditEvents.id })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.entityId, reservationId),
          eq(auditEvents.action, TRANSFER_EMAIL_SENT_ACTION),
        ),
      ),
  )
  return { guard: guard.length, audit: audit.length }
}

function mailer(fail = false) {
  const mails: string[] = []
  return {
    mails,
    sendMail: async (m: { to: string }) => {
      if (fail) return { error: "Resend indisponible (simulé)" }
      mails.push(m.to)
      return {}
    },
  }
}

test("envoi réussi : une garde permanente ET une trace d'audit écrites (l'action tient dans la colonne)", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const agencyId = await agencyFixture()
  t.after(() => cleanupAgency(agencyId))
  const reservationId = randomUUID()
  const m = mailer()
  const r = await sendTransferEmailOnce(event(agencyId, reservationId), {
    sendMail: m.sendMail,
  })
  assert.deepEqual(r, { sent: true })
  assert.equal(m.mails.length, 1)
  assert.deepEqual(await rows(reservationId), { guard: 1, audit: 1 })
})

test("événement rejoué : aucun second email, aucune seconde ligne", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const agencyId = await agencyFixture()
  t.after(() => cleanupAgency(agencyId))
  const reservationId = randomUUID()
  const m = mailer()
  const e = event(agencyId, reservationId)
  await sendTransferEmailOnce(e, { sendMail: m.sendMail })
  const again = await sendTransferEmailOnce(e, { sendMail: m.sendMail })
  const third = await sendTransferEmailOnce(e, { sendMail: m.sendMail })
  assert.deepEqual(again, { alreadySent: true })
  assert.deepEqual(third, { alreadySent: true })
  assert.equal(m.mails.length, 1)
  assert.deepEqual(await rows(reservationId), { guard: 1, audit: 1 })
})

test("Resend en panne : erreur levée, rien d'enregistré ; au retry l'email part une seule fois", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const agencyId = await agencyFixture()
  t.after(() => cleanupAgency(agencyId))
  const reservationId = randomUUID()
  const e = event(agencyId, reservationId)
  const originalError = console.error
  console.error = () => {}
  try {
    await assert.rejects(
      sendTransferEmailOnce(e, { sendMail: mailer(true).sendMail }),
      /Resend error/,
    )
  } finally {
    console.error = originalError
  }
  assert.deepEqual(await rows(reservationId), { guard: 0, audit: 0 })

  const ok = mailer()
  assert.deepEqual(await sendTransferEmailOnce(e, { sendMail: ok.sendMail }), {
    sent: true,
  })
  assert.deepEqual(await sendTransferEmailOnce(e, { sendMail: ok.sendMail }), {
    alreadySent: true,
  })
  assert.equal(ok.mails.length, 1)
  assert.deepEqual(await rows(reservationId), { guard: 1, audit: 1 })
})

test("deux réservations indépendantes : chacune reçoit son email", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const agencyId = await agencyFixture()
  t.after(() => cleanupAgency(agencyId))
  const a = randomUUID()
  const b = randomUUID()
  const m = mailer()
  await sendTransferEmailOnce(event(agencyId, a), { sendMail: m.sendMail })
  await sendTransferEmailOnce(event(agencyId, b), { sendMail: m.sendMail })
  assert.equal(m.mails.length, 2)
  assert.deepEqual(await rows(a), { guard: 1, audit: 1 })
  assert.deepEqual(await rows(b), { guard: 1, audit: 1 })
})
