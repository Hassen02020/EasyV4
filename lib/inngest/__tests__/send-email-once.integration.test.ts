/**
 * OMRA-PACKAGE-NOTIFY-RELIABILITY-01 — preuve d'intégration réelle
 * (PostgreSQL) de la garde d'envoi unique des emails Omra et package : seul
 * l'envoi (Resend) est simulé ; `notification_idempotency` et `audit_events`
 * utilisent la vraie base.
 */
import test, { before } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { and, eq, sql } from "drizzle-orm"

import { withSystemContext } from "@/lib/db/tenant-context"
import { agencies, auditEvents, notificationIdempotency } from "@/lib/db/schema"
import { sendEmailOnce } from "../send-email-once"
import { OMRA_EMAIL_SENT_ACTION } from "../functions/process-omra-confirmed"
import { PACKAGE_EMAIL_SENT_ACTION } from "../functions/process-package-confirmed"

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
      slug: `op-mail-${agencyId.slice(0, 8)}`,
      name: "OMRA-PACKAGE-NOTIFY-RELIABILITY-01 — agence test",
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

async function rows(reservationId: string, action: string) {
  return withSystemContext(async (tx) => {
    const guard = await tx
      .select({ id: notificationIdempotency.id })
      .from(notificationIdempotency)
      .where(
        and(
          eq(notificationIdempotency.reservationId, reservationId),
          eq(notificationIdempotency.action, action),
        ),
      )
    const audit = await tx
      .select({ id: auditEvents.id })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.entityId, reservationId),
          eq(auditEvents.action, action),
        ),
      )
    return { guard: guard.length, audit: audit.length }
  })
}

for (const [label, action] of [
  ["omra", OMRA_EMAIL_SENT_ACTION],
  ["package", PACKAGE_EMAIL_SENT_ACTION],
] as const) {
  test(`${label} : un seul email sur deux passages, garde et trace écrites`, async (t) => {
    if (!dbAvailable) return t.skip(skip())
    const agencyId = await agencyFixture()
    try {
      const reservationId = randomUUID()
      const mails: string[] = []
      const sendMail = async (m: { to: string }) => {
        mails.push(m.to)
        return {}
      }
      const input = {
        action,
        agencyId,
        reservationId,
        publicRef: `${label.toUpperCase()}-TEST`,
        to: "client@example.test",
        from: "Easy2Book <noreply@easy2book.tn>",
        subject: "Confirmation",
        html: "<p>ok</p>",
        logTag: "[test]",
      }
      assert.deepEqual(await sendEmailOnce(input, { sendMail }), { sent: true })
      assert.deepEqual(await sendEmailOnce(input, { sendMail }), {
        alreadySent: true,
      })
      assert.equal(mails.length, 1)
      assert.deepEqual(await rows(reservationId, action), {
        guard: 1,
        audit: 1,
      })
    } finally {
      await cleanupAgency(agencyId)
    }
  })

  test(`${label} : échec Resend → rien d'enregistré, le réessai envoie une fois`, async (t) => {
    if (!dbAvailable) return t.skip(skip())
    const agencyId = await agencyFixture()
    try {
      const reservationId = randomUUID()
      let fail = true
      const mails: string[] = []
      const sendMail = async (m: { to: string }) => {
        if (fail) {
          fail = false
          return { error: "resend 500" }
        }
        mails.push(m.to)
        return {}
      }
      const input = {
        action,
        agencyId,
        reservationId,
        publicRef: `${label.toUpperCase()}-TEST`,
        to: "client@example.test",
        from: "Easy2Book <noreply@easy2book.tn>",
        subject: "Confirmation",
        html: "<p>ok</p>",
        logTag: "[test]",
      }
      await assert.rejects(sendEmailOnce(input, { sendMail }), /Resend error/)
      assert.deepEqual(await rows(reservationId, action), {
        guard: 0,
        audit: 0,
      })
      assert.deepEqual(await sendEmailOnce(input, { sendMail }), { sent: true })
      assert.equal(mails.length, 1)
      assert.deepEqual(await rows(reservationId, action), {
        guard: 1,
        audit: 1,
      })
    } finally {
      await cleanupAgency(agencyId)
    }
  })
}
