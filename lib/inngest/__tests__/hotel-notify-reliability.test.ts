/**
 * HOTEL-NOTIFY-RELIABILITY-01 — les 4 émetteurs de `booking/confirmed`
 * (réservation hôtel B2B, invité, Hôtels Monde, webhook de paiement carte)
 * passent par sendEventReliable : id stable, 3 tentatives, trace technique en
 * échec, jamais d'exception vers la réservation ni le webhook. Plus aucun
 * `sendEvent(...).catch(() => {})` qui perdait l'événement — donc l'email,
 * le voucher et la facture — sans trace.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { execSync } from "node:child_process"

const EMITTERS: Array<[string, string]> = [
  ["lib/booking/actions.ts", "result.agencyId"],
  ["lib/booking/guest-actions.ts", "agencyId"],
  ["lib/hotels-monde/guest-booking-actions.ts", "agencyId"],
  ["app/api/payment/reservation-webhook/route.ts", "result.agencyId"],
]

for (const [file, agency] of EMITTERS) {
  test(`${file} : booking/confirmed émis via sendEventReliable`, () => {
    const src = readFileSync(join(process.cwd(), file), "utf8")
    assert.match(
      src,
      /import \{ sendEventReliable \} from "@\/lib\/inngest\/send-reliable"/,
    )
    const escaped = agency.replace(".", "\\.")
    assert.match(
      src,
      new RegExp(
        `await sendEventReliable\\(\\s*"booking\\/confirmed"[\\s\\S]{0,1200}?\\{\\s*reservationId:\\s*result\\.reservationId,\\s*agencyId:\\s*${escaped}\\s*\\}`,
      ),
    )
    assert.doesNotMatch(src, /sendEvent\(\s*"booking\/confirmed"/)
  })
}

test("plus aucun émetteur de booking/confirmed en fire-and-forget dans le code", () => {
  const out = new Set<string>()
  const hits = execSync(
    `grep -rlE 'sendEvent\\(\\s*"booking/confirmed"' lib app --include=*.ts --include=*.tsx || true`,
    { cwd: process.cwd(), encoding: "utf8" },
  )
  for (const line of hits.split("\n").filter(Boolean)) {
    if (
      !line.includes("__tests__") &&
      !line.endsWith("lib/inngest/client.ts")
    ) {
      out.add(line)
    }
  }
  assert.deepEqual([...out], [])
})
