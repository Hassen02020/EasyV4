/**
 * UX-PUBLIC-01 — régression : TransferBookingForm (utilisé par la vraie page
 * publique /transferts/resultats) était 100% en français en dur, zéro appel
 * useTranslations — contrairement à OmraGuestBookingForm qui, lui, était
 * déjà internationalisé. Un client EN/AR voyait le formulaire de réservation
 * de transfert entièrement en français.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../",
)

const NEW_KEYS = [
  "bookingFormSubtitle",
  "fromZoneLabel",
  "toZoneLabel",
  "vehicleScheduleSectionTitle",
  "pickupDateLabel",
  "nightRateApplied",
  "dayRate",
  "luggageCountLabel",
  "flightNumberLabel",
  "customerInfoSectionTitle",
  "firstNameLabel",
  "lastNameLabel",
  "phoneLabel",
  "emailLabel",
  "cinLabel",
  "quoteCardTitle",
  "basePriceLabel",
  "nightSurchargeLabel",
  "agencyMarginLabel",
  "totalInclTax",
  "walletDebitNotice",
  "processingLong",
  "processingShort",
  "confirmBookingLong",
  "confirmBookingShort",
  "noPricingForRouteVehicle",
  "unknownError",
  "vehicleSedanOption",
  "vehicleVanOption",
  "vehicleMinibusOption",
  "vehicleBusOption",
  "vehicleLuxuryOption",
]

test('TransferBookingForm utilise useTranslations("Transferts") et n\'a plus de titre/libellés français en dur', () => {
  const source = readFileSync(
    path.join(ROOT, "components/transfer/transfer-booking-form.tsx"),
    "utf8",
  )
  assert.match(source, /useTranslations\(\s*"Transferts"\s*\)/)
  assert.doesNotMatch(source, />\s*Réservation de Transfert\s*</)
  assert.doesNotMatch(source, />\s*Confirmer la Réservation\s*</)
  assert.doesNotMatch(source, />\s*Informations du client\s*</)
})

test("les nouvelles clés Transferts existent dans fr/en/ar avec de vraies traductions (pas une copie de fr)", () => {
  const fr = JSON.parse(
    readFileSync(path.join(ROOT, "messages/fr.json"), "utf8"),
  ).Transferts
  const en = JSON.parse(
    readFileSync(path.join(ROOT, "messages/en.json"), "utf8"),
  ).Transferts
  const ar = JSON.parse(
    readFileSync(path.join(ROOT, "messages/ar.json"), "utf8"),
  ).Transferts

  // "Email" est un emprunt identique en fr et en en — pas une traduction
  // manquante (même constat que l'audit i18n initial sur ~6% des clés en).
  const EN_IDENTICAL_TO_FR_ALLOWED = new Set(["emailLabel"])

  for (const key of NEW_KEYS) {
    assert.ok(fr[key], `fr.Transferts.${key} manquant`)
    assert.ok(en[key], `en.Transferts.${key} manquant`)
    assert.ok(ar[key], `ar.Transferts.${key} manquant`)
    if (!EN_IDENTICAL_TO_FR_ALLOWED.has(key)) {
      assert.notEqual(
        en[key],
        fr[key],
        `en.Transferts.${key} est identique à fr — traduction manquante`,
      )
    }
    assert.notEqual(
      ar[key],
      fr[key],
      `ar.Transferts.${key} est identique à fr — traduction manquante`,
    )
  }
})
