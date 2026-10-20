/**
 * UX-PUBLIC-01 — régression : la page d'erreur de paiement
 * (app/(public)/[locale]/booking/checkout/error.tsx) était 100% en français
 * en dur (useTranslations jamais appelé). Un client EN/AR dont le paiement
 * échouait voyait du français au moment précis de l'échec de paiement.
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

test("error.tsx n'a plus de chaîne française en dur et utilise useTranslations", () => {
  const source = readFileSync(
    path.join(ROOT, "app/(public)/[locale]/booking/checkout/error.tsx"),
    "utf8",
  )
  assert.match(source, /useTranslations\(\s*"Booking"\s*\)/)
  assert.doesNotMatch(source, /Une erreur s&apos;est produite/)
  assert.doesNotMatch(source, /Réessayez ou relancez/)
})

test("les 3 nouvelles clés existent dans fr/en/ar avec de vraies traductions (pas une copie de fr)", () => {
  const fr = JSON.parse(
    readFileSync(path.join(ROOT, "messages/fr.json"), "utf8"),
  ).Booking
  const en = JSON.parse(
    readFileSync(path.join(ROOT, "messages/en.json"), "utf8"),
  ).Booking
  const ar = JSON.parse(
    readFileSync(path.join(ROOT, "messages/ar.json"), "utf8"),
  ).Booking

  for (const key of [
    "checkoutErrorTitle",
    "checkoutErrorDesc",
    "retryButton",
  ]) {
    assert.ok(fr[key], `fr.Booking.${key} manquant`)
    assert.ok(en[key], `en.Booking.${key} manquant`)
    assert.ok(ar[key], `ar.Booking.${key} manquant`)
    assert.notEqual(
      en[key],
      fr[key],
      `en.Booking.${key} est identique à fr — traduction manquante, pas une copie`,
    )
    assert.notEqual(
      ar[key],
      fr[key],
      `ar.Booking.${key} est identique à fr — traduction manquante, pas une copie`,
    )
  }
})
