/**
 * B2C-CANCEL-MONDE-02 — invariants statiques :
 * offerId stocké au booking et utilisé pour cancel() lors des annulations.
 *
 * Pattern readFileSync : vérifie les propriétés de câblage sans instancier
 * de serveur ni accéder à la DB.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const bookingActions = readFileSync(
  join(process.cwd(), "lib/hotels-monde/guest-booking-actions.ts"),
  "utf8",
)
const cancelActions = readFileSync(
  join(process.cwd(), "lib/booking/customer-cancel-actions.ts"),
  "utf8",
)
const schema = readFileSync(join(process.cwd(), "lib/db/schema.ts"), "utf8")
const migration = readFileSync(
  join(process.cwd(), "drizzle/0020_hotel_offer_id.sql"),
  "utf8",
)

// ===========================================================================
// guest-booking-actions — stockage offerId
// ===========================================================================

test("[booking] providerOfferId stocké lors du booking hotel_monde", () => {
  assert.match(
    bookingActions,
    /providerOfferId:\s*bookResult\.offerId/,
    "providerOfferId doit être assigné depuis bookResult.offerId",
  )
})

// ===========================================================================
// schema — colonne provider_offer_id
// ===========================================================================

test("[schema] reservation_hotel contient providerOfferId", () => {
  assert.match(
    schema,
    /providerOfferId:\s*varchar\("provider_offer_id"/,
    "colonne providerOfferId requise dans reservationHotel",
  )
})

// ===========================================================================
// migration — ALTER TABLE
// ===========================================================================

test("[migration] 0020 ajoute provider_offer_id à reservation_hotel", () => {
  assert.match(
    migration,
    /ALTER TABLE.*reservation_hotel.*ADD COLUMN/i,
    "migration doit ajouter la colonne via ALTER TABLE",
  )
  assert.match(
    migration,
    /provider_offer_id/,
    "nom de colonne provider_offer_id attendu dans la migration",
  )
})

// ===========================================================================
// customer-cancel-actions — appel cancel()
// ===========================================================================

test("[cancel] importe cancelVirtualHotel depuis virtual-supplier/engine", () => {
  assert.match(
    cancelActions,
    /cancel.*virtual-supplier\/engine/,
    "import de cancel() depuis virtual-supplier/engine requis",
  )
})

test("[cancel] guard providerOfferId && checkIn avant appel cancel", () => {
  assert.match(
    cancelActions,
    /preCheck\.providerOfferId.*&&.*preCheck\.checkIn/,
    "guard double (offerId + checkIn) requis avant cancel()",
  )
})

test("[cancel] cancel appelé avec offerId, checkIn et rooms", () => {
  assert.match(
    cancelActions,
    /offerId:\s*preCheck\.providerOfferId/,
    "offerId doit provenir de preCheck.providerOfferId",
  )
  assert.match(
    cancelActions,
    /checkIn:\s*preCheck\.checkIn/,
    "checkIn doit provenir de preCheck.checkIn",
  )
  assert.match(cancelActions, /rooms,/, "rooms doit être passé à cancel()")
})

test("[cancel] cancel appelé APRÈS le retour de la transaction DB", () => {
  const txReturnPos = cancelActions.indexOf("ok: true as const")
  const cancelCallPos = cancelActions.indexOf("cancelVirtualHotel(")
  assert.ok(txReturnPos > -1, "retour ok:true dans la transaction")
  assert.ok(cancelCallPos > -1, "cancelVirtualHotel doit être appelée")
  assert.ok(
    txReturnPos < cancelCallPos,
    "cancel() doit être appelée APRÈS la transaction (best-effort hors TX)",
  )
})

test("[cancel] supplierNotified reflète la présence de providerOfferId", () => {
  assert.match(
    cancelActions,
    /supplierNotified:\s*!!preCheck\.providerOfferId/,
    "supplierNotified doit dépendre de providerOfferId",
  )
})
