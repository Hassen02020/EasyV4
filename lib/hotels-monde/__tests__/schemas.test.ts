/**
 * PHONE-INTL-VOLS-HOTELS-MONDE-01 — preuve que worldHotelGuestSchema.phone
 * accepte désormais tout pays (E.164 via libphonenumber-js), pas seulement
 * la Tunisie — fonction pure, aucun accès DB requis.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { worldHotelGuestSchema } from "../schemas"

function validGuest(phone: string) {
  return {
    civility: "M" as const,
    firstName: "Jean",
    lastName: "Dupont",
    email: "jean@example.test",
    phone,
    nationality: "",
  }
}

test("worldHotelGuestSchema : numéro français E.164 valide → accepté", () => {
  const result = worldHotelGuestSchema.safeParse(validGuest("+33612345678"))
  assert.equal(result.success, true)
})

test("worldHotelGuestSchema : numéro tunisien E.164 valide → accepté", () => {
  const result = worldHotelGuestSchema.safeParse(validGuest("+21698140514"))
  assert.equal(result.success, true)
})

test("worldHotelGuestSchema : numéro italien E.164 valide → accepté", () => {
  const result = worldHotelGuestSchema.safeParse(validGuest("+393331234567"))
  assert.equal(result.success, true)
})

test("worldHotelGuestSchema : numéro incomplet/invalide → rejeté", () => {
  const result = worldHotelGuestSchema.safeParse(validGuest("+336123"))
  assert.equal(result.success, false)
})

test("worldHotelGuestSchema : texte non numérique → rejeté", () => {
  const result = worldHotelGuestSchema.safeParse(validGuest("pas un numéro"))
  assert.equal(result.success, false)
})

test("worldHotelGuestSchema : chaîne vide → rejetée (champ requis)", () => {
  const result = worldHotelGuestSchema.safeParse(validGuest(""))
  assert.equal(result.success, false)
})
