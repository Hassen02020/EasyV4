/**
 * TRANSFERS-CARS-DRIFT-01 — invariants statiques et comportementaux sur la
 * garde anti-drift de prix (CART-DRIFT-01) pour les 4 actions de réservation
 * Transfert et Voiture (2 B2C, 2 B2B).
 *
 * Périmètre :
 *   - B2C Transfert (createGuestTransferBooking) : garde active.
 *   - B2C Voiture (createGuestCarBooking) : garde active.
 *   - B2B Transfert (createTransferBooking) : garde présente, inactive dans
 *     le flux journey (expectedTotalTnd jamais transmis). Limite connue.
 *   - B2B Voiture (createCarBooking) : idem B2B Transfert.
 *
 * Structure :
 *   Tests 1–7   : statiques — câblage structurel (position garde, error map,
 *                 transmission composant). Prouvent que la garde est wired
 *                 dans chaque action à la bonne position.
 *   Tests 8–9   : comportementaux — primitive priceDrifted().
 *   Test  10    : comportemental action — harness reproduisant la séquence
 *                 critique (principe « throw avant insert »). Prouve le
 *                 comportement du pattern, pas les 4 actions réelles.
 *
 * Limite documentée : le harness ne déclenche pas la transaction Drizzle ni
 * le recalcul de prix réel. Un test d'intégration end-to-end (DB de test)
 * couvrirait le chemin complet. Hors périmètre de ce chantier.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()

const transferGuestSrc = readFileSync(
  join(ROOT, "lib/transfers/guest-booking-actions.ts"),
  "utf8",
)
const transferB2bSrc = readFileSync(
  join(ROOT, "lib/transfers/actions.ts"),
  "utf8",
)
const carGuestSrc = readFileSync(
  join(ROOT, "lib/cars/guest-booking-actions.ts"),
  "utf8",
)
const carB2bSrc = readFileSync(join(ROOT, "lib/cars/actions.ts"), "utf8")
const transferFormSrc = readFileSync(
  join(ROOT, "components/transfer/transfer-booking-form.tsx"),
  "utf8",
)
const carFormSrc = readFileSync(
  join(ROOT, "components/car/car-booking-form.tsx"),
  "utf8",
)

// ─── 1. expectedTotalTnd présent dans les 4 interfaces ───────────────────────

test("TRANSFERS-CARS-DRIFT-01: expectedTotalTnd dans GuestTransferBookingInput", () => {
  const ifaceIdx = transferGuestSrc.indexOf("GuestTransferBookingInput")
  assert.ok(ifaceIdx !== -1, "GuestTransferBookingInput non trouvée")
  assert.match(
    transferGuestSrc.slice(ifaceIdx, ifaceIdx + 1200),
    /expectedTotalTnd/,
  )
})

test("TRANSFERS-CARS-DRIFT-01: expectedTotalTnd dans TransferBookingInput (B2B)", () => {
  const ifaceIdx = transferB2bSrc.indexOf("TransferBookingInput")
  assert.ok(ifaceIdx !== -1, "TransferBookingInput non trouvée")
  assert.match(
    transferB2bSrc.slice(ifaceIdx, ifaceIdx + 1000),
    /expectedTotalTnd/,
  )
})

test("TRANSFERS-CARS-DRIFT-01: expectedTotalTnd dans GuestCarBookingInput", () => {
  const ifaceIdx = carGuestSrc.indexOf("GuestCarBookingInput")
  assert.ok(ifaceIdx !== -1, "GuestCarBookingInput non trouvée")
  assert.match(carGuestSrc.slice(ifaceIdx, ifaceIdx + 1100), /expectedTotalTnd/)
})

test("TRANSFERS-CARS-DRIFT-01: expectedTotalTnd dans CarBookingInput (B2B)", () => {
  const ifaceIdx = carB2bSrc.indexOf("CarBookingInput")
  assert.ok(ifaceIdx !== -1, "CarBookingInput non trouvée")
  assert.match(carB2bSrc.slice(ifaceIdx, ifaceIdx + 900), /expectedTotalTnd/)
})

// ─── 2. priceDrifted importé dans les 4 fichiers action ──────────────────────

test("TRANSFERS-CARS-DRIFT-01: priceDrifted importé dans guest-booking-actions.ts (Transfert)", () => {
  assert.match(transferGuestSrc, /priceDrifted/)
  assert.match(transferGuestSrc, /from.*@\/lib\/booking\/pricing/)
})

test("TRANSFERS-CARS-DRIFT-01: priceDrifted importé dans actions.ts (Transfert B2B)", () => {
  assert.match(transferB2bSrc, /priceDrifted/)
  assert.match(transferB2bSrc, /from.*@\/lib\/booking\/pricing/)
})

test("TRANSFERS-CARS-DRIFT-01: priceDrifted importé dans guest-booking-actions.ts (Voiture)", () => {
  assert.match(carGuestSrc, /priceDrifted/)
  assert.match(carGuestSrc, /from.*@\/lib\/booking\/pricing/)
})

test("TRANSFERS-CARS-DRIFT-01: priceDrifted importé dans actions.ts (Voiture B2B)", () => {
  assert.match(carB2bSrc, /priceDrifted/)
  assert.match(carB2bSrc, /from.*@\/lib\/booking\/pricing/)
})

// ─── 3. Appel priceDrifted(input.expectedTotalTnd, totalTnd) dans les 4 ──────

test("TRANSFERS-CARS-DRIFT-01: appel priceDrifted présent dans guest-booking-actions.ts (Transfert)", () => {
  assert.match(
    transferGuestSrc,
    /priceDrifted\(input\.expectedTotalTnd,\s*totalTnd\)/,
  )
})

test("TRANSFERS-CARS-DRIFT-01: appel priceDrifted présent dans actions.ts (Transfert B2B)", () => {
  assert.match(
    transferB2bSrc,
    /priceDrifted\(input\.expectedTotalTnd,\s*totalTnd\)/,
  )
})

test("TRANSFERS-CARS-DRIFT-01: appel priceDrifted présent dans guest-booking-actions.ts (Voiture)", () => {
  assert.match(
    carGuestSrc,
    /priceDrifted\(input\.expectedTotalTnd,\s*totalTnd\)/,
  )
})

test("TRANSFERS-CARS-DRIFT-01: appel priceDrifted présent dans actions.ts (Voiture B2B)", () => {
  assert.match(carB2bSrc, /priceDrifted\(input\.expectedTotalTnd,\s*totalTnd\)/)
})

// ─── 4. Garde AVANT applyPromoDiscountCore (B2C uniquement) ──────────────────

test("TRANSFERS-CARS-DRIFT-01: garde avant applyPromoDiscountCore (Transfert B2C)", () => {
  const driftIdx = transferGuestSrc.indexOf(
    "priceDrifted(input.expectedTotalTnd",
  )
  const promoIdx = transferGuestSrc.indexOf("applyPromoDiscountCore(")
  assert.ok(driftIdx !== -1, "priceDrifted non trouvé")
  assert.ok(promoIdx !== -1, "applyPromoDiscountCore non trouvé")
  assert.ok(driftIdx < promoIdx, "garde DOIT précéder applyPromoDiscountCore")
})

test("TRANSFERS-CARS-DRIFT-01: garde avant applyPromoDiscountCore (Voiture B2C)", () => {
  const driftIdx = carGuestSrc.indexOf("priceDrifted(input.expectedTotalTnd")
  const promoIdx = carGuestSrc.indexOf("applyPromoDiscountCore(")
  assert.ok(driftIdx !== -1, "priceDrifted non trouvé")
  assert.ok(promoIdx !== -1, "applyPromoDiscountCore non trouvé")
  assert.ok(driftIdx < promoIdx, "garde DOIT précéder applyPromoDiscountCore")
})

// ─── 5. Garde AVANT .insert(customers) dans les 4 fichiers ───────────────────

test("TRANSFERS-CARS-DRIFT-01: garde avant insert (Transfert B2C)", () => {
  const driftIdx = transferGuestSrc.indexOf(
    "priceDrifted(input.expectedTotalTnd",
  )
  const insertIdx = transferGuestSrc.indexOf(".insert(customers)")
  assert.ok(driftIdx !== -1, "priceDrifted non trouvé")
  assert.ok(insertIdx !== -1, "insert customers non trouvé")
  assert.ok(driftIdx < insertIdx, "garde DOIT précéder le premier insert")
})

test("TRANSFERS-CARS-DRIFT-01: garde avant insert (Transfert B2B)", () => {
  const driftIdx = transferB2bSrc.indexOf("priceDrifted(input.expectedTotalTnd")
  const insertIdx = transferB2bSrc.indexOf(".insert(customers)")
  assert.ok(driftIdx !== -1, "priceDrifted non trouvé")
  assert.ok(insertIdx !== -1, "insert customers non trouvé")
  assert.ok(driftIdx < insertIdx, "garde DOIT précéder le premier insert")
})

test("TRANSFERS-CARS-DRIFT-01: garde avant insert (Voiture B2C)", () => {
  const driftIdx = carGuestSrc.indexOf("priceDrifted(input.expectedTotalTnd")
  const insertIdx = carGuestSrc.indexOf(".insert(customers)")
  assert.ok(driftIdx !== -1, "priceDrifted non trouvé")
  assert.ok(insertIdx !== -1, "insert customers non trouvé")
  assert.ok(driftIdx < insertIdx, "garde DOIT précéder le premier insert")
})

test("TRANSFERS-CARS-DRIFT-01: garde avant insert (Voiture B2B)", () => {
  const driftIdx = carB2bSrc.indexOf("priceDrifted(input.expectedTotalTnd")
  const insertIdx = carB2bSrc.indexOf(".insert(customers)")
  assert.ok(driftIdx !== -1, "priceDrifted non trouvé")
  assert.ok(insertIdx !== -1, "insert customers non trouvé")
  assert.ok(driftIdx < insertIdx, "garde DOIT précéder le premier insert")
})

// ─── 6. Code PRICE_CHANGED dans les 4 error maps ─────────────────────────────

test("TRANSFERS-CARS-DRIFT-01: PRICE_CHANGED dans error map (Transfert B2C)", () => {
  assert.match(transferGuestSrc, /PRICE_CHANGED/)
})

test("TRANSFERS-CARS-DRIFT-01: PRICE_CHANGED dans error map (Transfert B2B)", () => {
  assert.match(transferB2bSrc, /PRICE_CHANGED/)
})

test("TRANSFERS-CARS-DRIFT-01: PRICE_CHANGED dans error map (Voiture B2C)", () => {
  assert.match(carGuestSrc, /PRICE_CHANGED/)
})

test("TRANSFERS-CARS-DRIFT-01: PRICE_CHANGED dans error map (Voiture B2B)", () => {
  assert.match(carB2bSrc, /PRICE_CHANGED/)
})

// ─── 7. expectedTotalTnd transmis depuis les 2 composants B2C ────────────────

test("TRANSFERS-CARS-DRIFT-01: expectedTotalTnd transmis dans transfer-booking-form.tsx", () => {
  const callIdx = transferFormSrc.lastIndexOf("createGuestTransferBooking(")
  assert.ok(
    callIdx !== -1,
    "createGuestTransferBooking non trouvé dans le composant",
  )
  assert.match(
    transferFormSrc.slice(callIdx, callIdx + 600),
    /expectedTotalTnd/,
  )
})

test("TRANSFERS-CARS-DRIFT-01: expectedTotalTnd transmis dans car-booking-form.tsx", () => {
  const callIdx = carFormSrc.lastIndexOf("createGuestCarBooking(")
  assert.ok(
    callIdx !== -1,
    "createGuestCarBooking non trouvé dans le composant",
  )
  assert.match(carFormSrc.slice(callIdx, callIdx + 600), /expectedTotalTnd/)
})

// ─── 8. [comportemental] priceDrifted(100, 200) → true ───────────────────────

test("TRANSFERS-CARS-DRIFT-01: priceDrifted(100, 200) retourne true (prix changé)", async () => {
  const { priceDrifted } = await import("@/lib/booking/pricing")
  assert.strictEqual(priceDrifted(100, 200), true)
})

// ─── 9. [comportemental] priceDrifted(undefined, 200) → false ────────────────

test("TRANSFERS-CARS-DRIFT-01: priceDrifted(undefined, 200) retourne false (flux B2B sans référence)", async () => {
  const { priceDrifted } = await import("@/lib/booking/pricing")
  assert.strictEqual(priceDrifted(undefined, 200), false)
})

// ─── 10. [comportemental action — harness] throw avant insert ────────────────
//
// Ce test prouve que le PRINCIPE « throw avant insert » intercepte avant toute
// écriture. Il ne prouve PAS que les 4 actions réelles utilisent correctement
// ce mécanisme — c'est le rôle des tests statiques 1–7.

test("TRANSFERS-CARS-DRIFT-01: harness — PRICE_CHANGED levé avant toute écriture quand prix drifté", async () => {
  const { priceDrifted } = await import("@/lib/booking/pricing")

  function guardThenInsert(
    expectedTotalTnd: number | undefined,
    totalTnd: number,
    insertSpy: { called: boolean },
  ) {
    if (priceDrifted(expectedTotalTnd, totalTnd)) {
      throw new Error(
        `PRICE_CHANGED: prix affiché ${expectedTotalTnd} TND → prix réel ${totalTnd} TND`,
      )
    }
    insertSpy.called = true
  }

  const spy = { called: false }
  assert.throws(
    () => guardThenInsert(100, 200, spy),
    (err: unknown) => {
      assert.ok(err instanceof Error)
      assert.match(err.message, /PRICE_CHANGED/)
      return true
    },
  )
  assert.strictEqual(spy.called, false, "insert NE DOIT PAS être appelé")
})
