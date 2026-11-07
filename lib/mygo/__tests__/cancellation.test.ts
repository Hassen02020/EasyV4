/**
 * CANCEL-POLICY-DISPLAY-01 — interprétation unique des paliers d'annulation
 * myGo. Cas de référence : réponse myGo RÉELLE de production (Residence
 * Romane, 14→15/12/2026, constatée le 2026-11-07).
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import {
  formatFreeCancellationUntil,
  isFreeCancellation,
  parseMyGoDate,
  summarizeMyGoCancellation,
} from "../cancellation"
import { computeFacets, hasFreeCancellation } from "../facets"
import type { HotelOfferDTO } from "../types"

const PROD_POLICIES = [
  {
    fees: 1,
    type: "NIGHT",
    nature: "BEFORE_ARRIVAL",
    fromDate: "13-12-2026 00:00",
  },
  { fees: 100, type: "PERCENT", nature: "NO_SHOW" },
  { fees: 100, type: "PERCENT", nature: "PREMATURE_DEPARTURE" },
]
const room = (over: Record<string, unknown> = {}) => ({
  notRefundable: false,
  cancellationPolicies: PROD_POLICIES,
  ...over,
})
const NOV_7 = new Date("2026-11-07T20:00:00Z")

test("date myGo « dd-MM-yyyy HH:mm » lue en heure de Tunis (UTC+1)", () => {
  assert.equal(
    parseMyGoDate("13-12-2026 00:00")?.toISOString(),
    "2026-12-12T23:00:00.000Z",
  )
  assert.equal(
    parseMyGoDate("13-12-2026")?.toISOString(),
    "2026-12-12T23:00:00.000Z",
  )
  assert.equal(parseMyGoDate("2026-12-13"), null)
  assert.equal(parseMyGoDate(""), null)
  // L'ancien affichage faisait new Date("13-12-2026 00:00") → Invalid Date.
  assert.ok(Number.isNaN(new Date("13-12-2026 00:00").getTime()))
})

test("cas réel de production : gratuit AVANT le 13/12/2026 00:00, frais ensuite", () => {
  const s = summarizeMyGoCancellation(room(), NOV_7)
  assert.equal(s.kind, "FREE_UNTIL")
  assert.equal(s.penaltyFrom, "2026-12-12T23:00:00.000Z")
  assert.equal(s.freeUntil, "2026-12-12T22:59:00.000Z")
  assert.equal(isFreeCancellation(s), true)
  // Le jour même du premier palier : plus gratuit.
  const after = summarizeMyGoCancellation(
    room(),
    new Date("2026-12-12T23:00:00Z"),
  )
  assert.equal(after.kind, "PENALTY")
  assert.equal(isFreeCancellation(after), false)
})

test("non remboursable, gratuit sans palier payant, et inconnu — jamais deviné", () => {
  assert.equal(
    summarizeMyGoCancellation(room({ notRefundable: true }), NOV_7).kind,
    "NON_REFUNDABLE",
  )
  assert.equal(
    summarizeMyGoCancellation(
      room({
        cancellationPolicies: [
          { fees: 0, nature: "BEFORE_ARRIVAL", fromDate: "01-12-2026 00:00" },
        ],
      }),
      NOV_7,
    ).kind,
    "FREE",
  )
  // Aucun palier « avant arrivée » : on ne sait pas → sur demande.
  assert.equal(
    summarizeMyGoCancellation(
      room({ cancellationPolicies: [{ fees: 100, nature: "NO_SHOW" }] }),
      NOV_7,
    ).kind,
    "UNKNOWN",
  )
  assert.equal(
    summarizeMyGoCancellation(room({ cancellationPolicies: [] }), NOV_7).kind,
    "UNKNOWN",
  )
  // Palier payant sans date lisible : impossible de dater la gratuité.
  assert.equal(
    summarizeMyGoCancellation(
      room({
        cancellationPolicies: [
          { fees: 1, nature: "BEFORE_ARRIVAL", fromDate: "bientôt" },
        ],
      }),
      NOV_7,
    ).kind,
    "UNKNOWN",
  )
})

test("plusieurs paliers : la gratuité s'arrête au PREMIER palier payant", () => {
  const s = summarizeMyGoCancellation(
    room({
      cancellationPolicies: [
        { fees: 100, nature: "BEFORE_ARRIVAL", fromDate: "13-12-2026 00:00" },
        { fees: 30, nature: "BEFORE_ARRIVAL", fromDate: "01-12-2026 00:00" },
      ],
    }),
    NOV_7,
  )
  assert.equal(s.kind, "FREE_UNTIL")
  assert.equal(s.penaltyFrom, "2026-11-30T23:00:00.000Z")
})

test("format affiché : date ET heure exactes, en heure de Tunis", () => {
  const fr = formatFreeCancellationUntil("2026-12-12T23:00:00.000Z", "fr-FR")!
  assert.match(fr, /13 décembre 2026/)
  assert.match(fr, /00:00/)
  assert.equal(formatFreeCancellationUntil("pas une date", "fr-FR"), null)
  assert.equal(formatFreeCancellationUntil(undefined, "fr-FR"), null)
})

test("filtre « Annulation gratuite » : la chambre réelle compte désormais (avant : 0 sur 54)", () => {
  const offer = {
    hotel: { id: 412 },
    boardings: [
      {
        id: 4,
        code: "LPD",
        pax: [
          { rooms: [{ price: 86.728, stopReservation: false, ...room() }] },
        ],
      },
    ],
  } as unknown as HotelOfferDTO
  assert.equal(hasFreeCancellation(offer), true)
  assert.equal(computeFacets([offer]).freeCancellationCount, 1)
})

test("câblage : tous les écrans passent par l'interprétation unique, plus de « 48 h » codé en dur", () => {
  const src = (p: string) => readFileSync(p, "utf8")
  assert.match(src("lib/mygo/facets.ts"), /summarizeMyGoCancellation\(r\)/)
  assert.match(
    src("components/hotel-listings.tsx"),
    /summarizeMyGoCancellation\(room\)/,
  )
  assert.match(
    src("components/pro/pro-room-selector.tsx"),
    /summarizeMyGoCancellation\(r\)/,
  )
  for (const f of [
    "lib/mygo/facets.ts",
    "components/hotel-listings.tsx",
    "components/pro/pro-room-selector.tsx",
  ]) {
    assert.doesNotMatch(src(f), /fees === 0/, f)
  }
  const offerPage = src("app/(public)/[locale]/booking/page.tsx")
  assert.doesNotMatch(offerPage, /freeCancellation48h/)
  assert.match(offerPage, /readDraftHotelCancellation\(draft\)/)
  assert.match(
    src("app/(public)/[locale]/booking/checkout/page.tsx"),
    /hotelCancellation=\{readDraftHotelCancellation\(draft\)\}/,
  )
  assert.match(
    src("components/booking/checkout-form.tsx"),
    /formatFreeCancellationUntil\(/,
  )
  for (const l of ["fr", "en", "ar"]) {
    const m = JSON.parse(src(`messages/${l}.json`))
    assert.equal(m.Booking.freeCancellation48h, undefined, l)
    for (const k of [
      "cancellationFeesApply",
      "cancellationOnRequest",
      "nonRefundable",
      "freeCancellationUntilLabel",
    ]) {
      assert.ok(m.Booking[k], `${l} Booking.${k}`)
    }
    assert.ok(
      m.Hotels.cancellationFeesApply,
      `${l} Hotels.cancellationFeesApply`,
    )
    assert.ok(m.Common.paymentStatusVoided, `${l} Common.paymentStatusVoided`)
  }
})
