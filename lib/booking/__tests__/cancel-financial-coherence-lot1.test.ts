/**
 * CANCEL-FINANCIAL-COHERENCE-01, lot 1.
 *  T-2 : l'audit d'annulation client hôtel enregistre le remboursement
 *        RÉEL (constat production 2026-11-07 : 103,21 TND journalisés alors
 *        que rien n'avait été encaissé ni remboursé).
 *  T-3 : la ligne de paiement prévue d'un règlement différé porte l'acompte
 *        réellement demandé (décision Direction 2026-11-07, option B).
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { computePriceBreakdown } from "../pricing"

const src = (p: string) => readFileSync(p, "utf8")

test("T-2 : l'audit reservation.cancelled (client hôtel) journalise le remboursement effectif", () => {
  const s = src("lib/booking/customer-cancel-actions.ts")
  // Le montant effectif vient du résultat réel de applyReservationRefund.
  assert.match(
    s,
    /const effectiveRefundTnd = refundResult\.ok \? refundResult\.refundedTnd : 0/,
  )
  const audit = s.indexOf('action: "reservation.cancelled"')
  assert.ok(audit > 0)
  const diff = s.slice(audit, audit + 600)
  assert.match(diff, /refundTnd: effectiveRefundTnd,/)
  // Plus jamais le montant théorique « total − frais » en raccourci.
  assert.doesNotMatch(diff, /^\s*refundTnd,\s*$/m)
})

test("T-2 : les autres chemins d'annulation journalisaient déjà un montant réel (inchangés)", () => {
  assert.match(
    src("lib/booking/policy-cancel-core.ts"),
    /creditedTnd = refundResult\.ok \? refundResult\.refundedTnd : 0/,
  )
  assert.match(src("lib/admin/actions.ts"), /refundedTnd = refund\.refundedTnd/)
})

test("T-3 : ligne prévue d'un règlement différé = acompte demandé ; carte = total réellement débité", () => {
  const s = src("lib/booking/guest-actions.ts")
  // Même source que reservations.depositAmount (« Acompte demandé »).
  assert.match(s, /depositAmount: String\(breakdown\.depositTnd\)/)
  const offline = s.indexOf(
    'paymentMethod === "bank_deposit" ? "transfer" : paymentMethod,',
  )
  assert.ok(offline > 0)
  const row = s.slice(offline, offline + 900)
  assert.match(row, /originalAmount: breakdown\.depositTnd\.toFixed\(2\)/)
  assert.match(row, /tndAmount: breakdown\.depositTnd\.toFixed\(2\)/)
  assert.doesNotMatch(row, /breakdown\.totalTnd/)
  // La carte (redirection PSP) débite le total : sa ligne prévue reste au total.
  const card = s.indexOf(
    'method: "card",\n            pspOrderId: cardPaymentReference,',
  )
  assert.ok(card > 0, "ligne carte trouvée")
  assert.match(
    s.slice(card, card + 300),
    /tndAmount: breakdown\.totalTnd\.toFixed\(2\)/,
  )
})

test("T-3 : cas réel TG-2026-000004 — 86,73 HT + TVA 19 % = 103,21 TTC, acompte 30 % = 30,96", () => {
  const b = computePriceBreakdown({
    unitPriceTnd: 86.73,
    adults: 1,
    children: 0,
    vatRate: 19,
  })
  assert.equal(b.totalTnd, 103.21)
  assert.equal(b.depositTnd, 30.96)
})
