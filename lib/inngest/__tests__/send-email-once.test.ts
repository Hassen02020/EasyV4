/**
 * OMRA-PACKAGE-NOTIFY-RELIABILITY-01 — envoi unique d'un email de
 * confirmation (lib/inngest/send-email-once.ts), dépendances simulées, et
 * câblage des handlers Omra / package.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { sendEmailOnce, type EmailOnceInput } from "../send-email-once"
import { OMRA_EMAIL_SENT_ACTION } from "../functions/process-omra-confirmed"
import { PACKAGE_EMAIL_SENT_ACTION } from "../functions/process-package-confirmed"

function store(opts: { failSend?: number; failMark?: boolean } = {}) {
  const sent = new Set<string>()
  const mails: { to: string; subject: string; html: string }[] = []
  let failures = opts.failSend ?? 0
  return {
    mails,
    deps: () => ({
      hasSent: async (id: string) => sent.has(id),
      markSent: async (_a: string, id: string) => {
        if (opts.failMark) throw new Error("db down")
        sent.add(id)
      },
      sendMail: async (m: { to: string; subject: string; html: string }) => {
        if (failures > 0) {
          failures--
          return { error: "resend 500" }
        }
        mails.push(m)
        return {}
      },
    }),
  }
}

const INPUT: EmailOnceInput = {
  action: OMRA_EMAIL_SENT_ACTION,
  agencyId: "a1",
  reservationId: "r1",
  publicRef: "OM-1",
  to: "client@example.test",
  from: "Easy2Book <noreply@easy2book.tn>",
  subject: "Confirmation",
  html: "<p>ok</p>",
  logTag: "[test]",
}

test("premier passage : un email, puis aucun au second passage", async () => {
  const s = store()
  assert.deepEqual(await sendEmailOnce(INPUT, s.deps()), { sent: true })
  assert.deepEqual(await sendEmailOnce(INPUT, s.deps()), { alreadySent: true })
  assert.equal(s.mails.length, 1)
})

test("erreur Resend : levée (retry Inngest), puis un seul email au réessai", async () => {
  const s = store({ failSend: 1 })
  await assert.rejects(sendEmailOnce(INPUT, s.deps()), /Resend error/)
  assert.equal(s.mails.length, 0)
  assert.deepEqual(await sendEmailOnce(INPUT, s.deps()), { sent: true })
  assert.equal(s.mails.length, 1)
})

test("sans destinataire : ignoré, aucun email", async () => {
  const s = store()
  assert.deepEqual(await sendEmailOnce({ ...INPUT, to: "" }, s.deps()), {
    skipped: true,
    reason: "no_customer_email",
  })
  assert.equal(s.mails.length, 0)
})

test("enregistrement échoué après envoi : pas d'exception (l'email est parti)", async () => {
  const s = store({ failMark: true })
  assert.deepEqual(await sendEmailOnce(INPUT, s.deps()), { sent: true })
})

test("action trop longue : refus AVANT tout envoi", async () => {
  const s = store()
  await assert.rejects(
    sendEmailOnce(
      { ...INPUT, action: "notification.omra_voucher_email.sent" },
      s.deps(),
    ),
    /action trop longue/,
  )
  assert.equal(s.mails.length, 0)
})

test("actions Omra et package ≤ 32 caractères et distinctes", () => {
  for (const a of [OMRA_EMAIL_SENT_ACTION, PACKAGE_EMAIL_SENT_ACTION]) {
    assert.ok(a.length <= 32, a)
  }
  assert.notEqual(OMRA_EMAIL_SENT_ACTION, PACKAGE_EMAIL_SENT_ACTION)
})

for (const mod of ["omra", "package"]) {
  test(`handler ${mod} : facture puis email en dernier, retries, concurrence par réservation`, () => {
    const src = readFileSync(
      join(process.cwd(), `lib/inngest/functions/process-${mod}-confirmed.ts`),
      "utf8",
    )
    const iInvoice = src.indexOf('step.run("generate-invoice"')
    const iMail = src.indexOf(`step.run("send-${mod}-email"`)
    assert.ok(iInvoice > 0 && iMail > iInvoice)
    assert.match(src, /retries:\s*3/)
    assert.match(
      src,
      /concurrency:\s*\{\s*key:\s*"event\.data\.reservationId",\s*limit:\s*1\s*\}/,
    )
    assert.match(src, /to:\s*d\.contactEmail/)
    // L'ancien comportement (erreur Resend avalée) a disparu.
    assert.doesNotMatch(src, /return \{ sent: false, error/)
    assert.doesNotMatch(src, /resend\.emails\.send/)
  })
}
