/**
 * CANCEL-POLICY-DISPLAY-01 — la page de l'offre et la page de paiement lisent
 * la même condition depuis le brouillon ; un ancien brouillon sans état
 * exact n'est jamais présenté comme « non remboursable ».
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readDraftHotelCancellation } from "../draft-cancellation"

const hotel = (metadata: Record<string, unknown>) => ({
  module: "hotel" as const,
  metadata,
})

test("état exact transmis par la fiche hôtel", () => {
  assert.deepEqual(
    readDraftHotelCancellation(
      hotel({
        cancellationKind: "FREE",
        hasFreeCancellation: true,
        freeCancellationDate: "2026-12-12T23:00:00.000Z",
      }),
    ),
    {
      kind: "FREE",
      hasFreeCancellation: true,
      freeCancellationDate: "2026-12-12T23:00:00.000Z",
    },
  )
  for (const kind of ["NON_REFUNDABLE", "PENALTY", "UNKNOWN"]) {
    const r = readDraftHotelCancellation(
      hotel({
        cancellationKind: kind,
        hasFreeCancellation: false,
        freeCancellationDate: "x",
      }),
    )
    assert.deepEqual(r, { kind, hasFreeCancellation: false }, kind)
  }
})

test("ancien brouillon : gratuit reste gratuit, « false » devient « sur demande » (jamais « non remboursable »)", () => {
  assert.equal(
    readDraftHotelCancellation(hotel({ hasFreeCancellation: true }))?.kind,
    "FREE",
  )
  assert.equal(
    readDraftHotelCancellation(hotel({ hasFreeCancellation: false }))?.kind,
    "UNKNOWN",
  )
  assert.equal(
    readDraftHotelCancellation(
      hotel({ cancellationKind: "n'importe quoi", hasFreeCancellation: false }),
    )?.kind,
    "UNKNOWN",
  )
})

test("hors hôtel, ou sans information : rien n'est affiché", () => {
  assert.equal(
    readDraftHotelCancellation({
      module: "package",
      metadata: { hasFreeCancellation: true },
    }),
    undefined,
  )
  assert.equal(readDraftHotelCancellation(hotel({})), undefined)
  assert.equal(
    readDraftHotelCancellation({ module: "hotel", metadata: undefined }),
    undefined,
  )
})
