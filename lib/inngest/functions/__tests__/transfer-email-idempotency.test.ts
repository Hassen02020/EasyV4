/**
 * TRANSFER-EMAIL-IDEMPOTENCY-01 — l'email de confirmation transfert part au
 * plus une fois par réservation, et une erreur Resend est levée (retry) au
 * lieu d'être avalée. Tests de la fonction RÉELLE sendTransferEmailOnce avec
 * dépendances injectées (aucun Resend, aucune base).
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import {
  sendTransferEmailOnce,
  TRANSFER_EMAIL_SENT_ACTION,
} from "../process-transfer-confirmed"
import type { Events } from "@/lib/inngest/client"

const D: Events["booking/transfer.confirmed"]["data"] = {
  reservationId: "11111111-1111-4111-8111-111111111111",
  publicRef: "TR-2026-000001",
  agencyId: "22222222-2222-4222-8222-222222222222",
  customerEmail: "reservation@easy2book.tn",
  customerPhone: "20000000",
  fromZone: "Aéroport Tunis-Carthage",
  toZone: "Hammamet",
  pickupAt: "2027-03-01T13:30:00.000Z",
  vehicleType: "van",
  totalTnd: 120,
}

function store() {
  const sentFor = new Set<string>()
  const mails: Array<{ to: string; subject: string; html: string }> = []
  const marks: string[] = []
  return {
    mails,
    marks,
    deps: (opts: { sendError?: string; markFails?: boolean } = {}) => ({
      hasSent: async (id: string) => sentFor.has(id),
      markSent: async (_a: string, id: string) => {
        if (opts.markFails) throw new Error("db down")
        sentFor.add(id)
        marks.push(id)
      },
      sendMail: async (mail: { to: string; subject: string; html: string }) => {
        if (opts.sendError) return { error: opts.sendError }
        mails.push(mail)
        return {}
      },
    }),
  }
}

test("premier envoi : un email au client, envoi enregistré", async () => {
  const s = store()
  const r = await sendTransferEmailOnce(D, s.deps())
  assert.deepEqual(r, { sent: true })
  assert.equal(s.mails.length, 1)
  assert.equal(s.mails[0]?.to, "reservation@easy2book.tn")
  assert.match(s.mails[0]!.subject, /TR-2026-000001/)
  assert.deepEqual(s.marks, [D.reservationId])
})

test("événement rejoué (même réservation) : aucun second email", async () => {
  const s = store()
  await sendTransferEmailOnce(D, s.deps())
  const again = await sendTransferEmailOnce(D, s.deps())
  const third = await sendTransferEmailOnce(D, s.deps())
  assert.deepEqual(again, { alreadySent: true })
  assert.deepEqual(third, { alreadySent: true })
  assert.equal(s.mails.length, 1)
})

test("réservations différentes : un email chacune", async () => {
  const s = store()
  await sendTransferEmailOnce(D, s.deps())
  await sendTransferEmailOnce(
    { ...D, reservationId: "33333333-3333-4333-8333-333333333333" },
    s.deps(),
  )
  assert.equal(s.mails.length, 2)
})

test("erreur Resend : LEVÉE (retry Inngest), rien n'est enregistré, le retry peut envoyer", async () => {
  const s = store()
  const originalError = console.error
  console.error = () => {}
  try {
    await assert.rejects(
      sendTransferEmailOnce(D, s.deps({ sendError: "rate limited" })),
      /Resend error: rate limited/,
    )
  } finally {
    console.error = originalError
  }
  assert.equal(s.marks.length, 0)
  // Le retry (Resend rétabli) envoie bien l'email, une seule fois.
  const retry = await sendTransferEmailOnce(D, s.deps())
  assert.deepEqual(retry, { sent: true })
  assert.equal(s.mails.length, 1)
})

test("enregistrement de l'envoi en échec après envoi : ne lève pas (l'email est parti), journalise", async () => {
  const s = store()
  const lines: string[] = []
  const originalError = console.error
  console.error = (...a: unknown[]) => {
    lines.push(a.map(String).join(" "))
  }
  try {
    const r = await sendTransferEmailOnce(D, s.deps({ markFails: true }))
    assert.deepEqual(r, { sent: true })
  } finally {
    console.error = originalError
  }
  assert.equal(s.mails.length, 1)
  assert.ok(lines.some((l) => l.includes("un renvoi est possible")))
})

test("sans adresse email : ignoré, rien envoyé", async () => {
  const s = store()
  const r = await sendTransferEmailOnce({ ...D, customerEmail: "" }, s.deps())
  assert.deepEqual(r, { skipped: true, reason: "no_customer_email" })
  assert.equal(s.mails.length, 0)
})

test("sans clé Resend (et sans injection) : ignoré proprement", async () => {
  const prev = process.env.RESEND_API_KEY
  delete process.env.RESEND_API_KEY
  try {
    const r = await sendTransferEmailOnce(D, {
      hasSent: async () => false,
      markSent: async () => {},
    })
    assert.deepEqual(r, { skipped: true, reason: "resend_not_configured" })
  } finally {
    if (prev !== undefined) process.env.RESEND_API_KEY = prev
  }
})

test("l'email affiche l'heure de prise en charge en heure de Tunis (13:30 UTC → 14:30)", async () => {
  const s = store()
  await sendTransferEmailOnce(D, s.deps())
  assert.match(s.mails[0]!.html, /14:30/)
})

test("l'action d'idempotence tient dans audit_events.action (≤ 32 caractères)", () => {
  assert.ok(TRANSFER_EMAIL_SENT_ACTION.length <= 32)
})

test("câblage du handler : facture → SMS → email en dernier, retries, concurrence par réservation", () => {
  const src = readFileSync(
    join(process.cwd(), "lib/inngest/functions/process-transfer-confirmed.ts"),
    "utf8",
  )
  const iInvoice = src.indexOf('step.run("generate-invoice"')
  const iSms = src.indexOf('step.run("send-driver-sms"')
  const iMail = src.indexOf('step.run("send-client-email"')
  assert.ok(iInvoice > 0 && iSms > iInvoice && iMail > iSms)
  assert.match(src, /retries:\s*3/)
  assert.match(
    src,
    /concurrency:\s*\{\s*key:\s*"event\.data\.reservationId",\s*limit:\s*1\s*\}/,
  )
  assert.match(src, /sendTransferEmailOnce\(d\)/)
  // L'ancien comportement (erreur avalée) a disparu.
  assert.doesNotMatch(src, /return \{ sent: false, error/)
})
