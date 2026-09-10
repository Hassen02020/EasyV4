import test from "node:test"
import assert from "node:assert/strict"

import {
  isVoucherEligible,
  isOmraVoucherEligible,
  isPackageVoucherEligible,
  isHotelReservationVoucherEligible,
  voucherHrefForModule,
} from "../voucher-eligibility"

const baseHotelRow = {
  module: "hotel",
  hotelName: "Yocca Hotel Residence",
  checkIn: "2026-09-10",
  checkOut: "2026-09-13",
}

test("isVoucherEligible : true pour une réservation hôtel confirmée", () => {
  assert.equal(isVoucherEligible({ ...baseHotelRow, status: "confirmed" }), true)
})

test("isVoucherEligible : true pour un séjour terminé (completed)", () => {
  assert.equal(isVoucherEligible({ ...baseHotelRow, status: "completed" }), true)
})

test("isVoucherEligible : false pour une réservation encore pending (pas de faux voucher)", () => {
  assert.equal(isVoucherEligible({ ...baseHotelRow, status: "pending" }), false)
})

test("isVoucherEligible : false pour une réservation on_request", () => {
  assert.equal(isVoucherEligible({ ...baseHotelRow, status: "on_request" }), false)
})

test("isVoucherEligible : false pour une réservation annulée", () => {
  assert.equal(isVoucherEligible({ ...baseHotelRow, status: "cancelled" }), false)
})

test("isVoucherEligible : false pour une réservation remboursée", () => {
  assert.equal(isVoucherEligible({ ...baseHotelRow, status: "refunded" }), false)
})

test("isVoucherEligible : false pour un module non-hôtel même confirmé", () => {
  assert.equal(
    isVoucherEligible({ module: "transfer", status: "confirmed", hotelName: null, checkIn: null, checkOut: null }),
    false,
  )
})

test("isVoucherEligible : false si les données de séjour sont incomplètes", () => {
  assert.equal(
    isVoucherEligible({ module: "hotel", status: "confirmed", hotelName: null, checkIn: "2026-09-10", checkOut: "2026-09-13" }),
    false,
  )
})

/* -------------------------------------------------------------------------- */
/* isOmraVoucherEligible (Phase 12, Partie 7)                                 */
/* -------------------------------------------------------------------------- */

const baseOmraRow = {
  module: "omra",
  packageName: "Omra Ramadan 2026 — 10 jours",
  departureDate: "2026-03-01",
  returnDate: "2026-03-11",
}

test("isOmraVoucherEligible : true pour une réservation Omra confirmée", () => {
  assert.equal(isOmraVoucherEligible({ ...baseOmraRow, status: "confirmed" }), true)
})

test("isOmraVoucherEligible : true pour un séjour Omra terminé (completed)", () => {
  assert.equal(isOmraVoucherEligible({ ...baseOmraRow, status: "completed" }), true)
})

test("isOmraVoucherEligible : false pour une réservation Omra encore pending (pas de faux voucher)", () => {
  assert.equal(isOmraVoucherEligible({ ...baseOmraRow, status: "pending" }), false)
})

test("isOmraVoucherEligible : false pour une réservation Omra annulée", () => {
  assert.equal(isOmraVoucherEligible({ ...baseOmraRow, status: "cancelled" }), false)
})

test("isOmraVoucherEligible : false pour une réservation Omra remboursée", () => {
  assert.equal(isOmraVoucherEligible({ ...baseOmraRow, status: "refunded" }), false)
})

test("isOmraVoucherEligible : false pour un module non-omra même confirmé", () => {
  assert.equal(
    isOmraVoucherEligible({ module: "hotel", status: "confirmed", packageName: null, departureDate: null, returnDate: null }),
    false,
  )
})

test("isOmraVoucherEligible : false si les données de séjour Omra sont incomplètes", () => {
  assert.equal(
    isOmraVoucherEligible({ module: "omra", status: "confirmed", packageName: null, departureDate: "2026-03-01", returnDate: "2026-03-11" }),
    false,
  )
})

/* -------------------------------------------------------------------------- */
/* isPackageVoucherEligible (Phase 12, Partie 9-10)                           */
/* -------------------------------------------------------------------------- */

const basePackageRow = {
  module: "package",
  packageName: "Istanbul Découverte — 5 jours",
  departureDate: "2026-05-01",
  returnDate: "2026-05-06",
}

test("isPackageVoucherEligible : true pour une réservation Package confirmée", () => {
  assert.equal(isPackageVoucherEligible({ ...basePackageRow, status: "confirmed" }), true)
})

test("isPackageVoucherEligible : true pour un voyage terminé (completed)", () => {
  assert.equal(isPackageVoucherEligible({ ...basePackageRow, status: "completed" }), true)
})

test("isPackageVoucherEligible : false pour une réservation encore pending", () => {
  assert.equal(isPackageVoucherEligible({ ...basePackageRow, status: "pending" }), false)
})

test("isPackageVoucherEligible : false pour une réservation annulée", () => {
  assert.equal(isPackageVoucherEligible({ ...basePackageRow, status: "cancelled" }), false)
})

test("isPackageVoucherEligible : false pour une réservation remboursée", () => {
  assert.equal(isPackageVoucherEligible({ ...basePackageRow, status: "refunded" }), false)
})

test("isPackageVoucherEligible : false pour un module non-package même confirmé", () => {
  assert.equal(
    isPackageVoucherEligible({ module: "omra", status: "confirmed", packageName: null, departureDate: null, returnDate: null }),
    false,
  )
})

test("isPackageVoucherEligible : false si les données de voyage sont incomplètes", () => {
  assert.equal(
    isPackageVoucherEligible({ module: "package", status: "confirmed", packageName: null, departureDate: "2026-05-01", returnDate: "2026-05-06" }),
    false,
  )
})

/* -------------------------------------------------------------------------- */
/* voucherHrefForModule (Phase 38B — Voucher Hardening)                       */
/*                                                                            */
/* Source unique de vérité pour la route voucher par module — avant cette    */
/* extraction, deux copies indépendantes (confirmation page + /compte)       */
/* avaient déjà divergé : l'une omettait "activity" (fallback silencieux     */
/* vers le PDF hôtel), l'autre n'autorisait QUE "hotel" alors que les routes */
/* Omra/Package/Activity existent et fonctionnent déjà.                     */
/* -------------------------------------------------------------------------- */

test("voucherHrefForModule : construit le bon lien pour hotel", () => {
  assert.equal(
    voucherHrefForModule("hotel", "TG-2026-000123", "tok123"),
    "/api/booking/voucher/TG-2026-000123?token=tok123",
  )
})

test("voucherHrefForModule : construit le bon lien pour omra", () => {
  assert.equal(
    voucherHrefForModule("omra", "OM-2026-000045", "tokabc"),
    "/api/omra/voucher/OM-2026-000045?token=tokabc",
  )
})

test("voucherHrefForModule : construit le bon lien pour package", () => {
  assert.equal(
    voucherHrefForModule("package", "PK-2026-000007", "tokxyz"),
    "/api/packages/voucher/PK-2026-000007?token=tokxyz",
  )
})

test("voucherHrefForModule : construit le bon lien pour activity (gap Phase 38A confirmé — manquait sur la page de confirmation)", () => {
  assert.equal(
    voucherHrefForModule("activity", "AT-2026-000099", "tokqqq"),
    "/api/activities/voucher/AT-2026-000099?token=tokqqq",
  )
})

test("voucherHrefForModule : null pour un module sans route voucher (jamais un lien fabriqué vers une route inexistante)", () => {
  assert.equal(voucherHrefForModule("flight", "FL-2026-000001", "tok"), null)
  assert.equal(voucherHrefForModule("transfer", "TR-2026-000001", "tok"), null)
  assert.equal(voucherHrefForModule("car", "CR-2026-000001", "tok"), null)
})

/* -------------------------------------------------------------------------- */
/* isHotelReservationVoucherEligible (Réservations+vouchers — écrans détail   */
/* Admin/Pro : /api/admin/.../voucher et /api/pro/.../voucher ne gèrent que   */
/* le module hôtel, contrairement aux routes guest publiques par module)      */
/* -------------------------------------------------------------------------- */

test("isHotelReservationVoucherEligible : true pour hôtel confirmé", () => {
  assert.equal(isHotelReservationVoucherEligible("hotel", "confirmed"), true)
})

test("isHotelReservationVoucherEligible : true pour hôtel terminé (completed)", () => {
  assert.equal(isHotelReservationVoucherEligible("hotel", "completed"), true)
})

test("isHotelReservationVoucherEligible : false pour hôtel annulé (voucher invalidé après annulation)", () => {
  assert.equal(isHotelReservationVoucherEligible("hotel", "cancelled"), false)
})

test("isHotelReservationVoucherEligible : false pour hôtel remboursé", () => {
  assert.equal(isHotelReservationVoucherEligible("hotel", "refunded"), false)
})

test("isHotelReservationVoucherEligible : false pour hôtel encore pending (pas de voucher pour paiement non confirmé)", () => {
  assert.equal(isHotelReservationVoucherEligible("hotel", "pending"), false)
})

test("isHotelReservationVoucherEligible : false pour un module non-hôtel même confirmé (routes admin/pro n'ont pas de rendu Omra/Package/Activity)", () => {
  assert.equal(isHotelReservationVoucherEligible("omra", "confirmed"), false)
  assert.equal(isHotelReservationVoucherEligible("package", "confirmed"), false)
  assert.equal(isHotelReservationVoucherEligible("activity", "confirmed"), false)
})
