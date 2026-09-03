import test from "node:test"
import assert from "node:assert/strict"
import { resolveWalletCreditMethodLabel } from "../process-wallet-credit"

test("resolveWalletCreditMethodLabel : traduit les vraies valeurs de l'enum recharge_method", () => {
  assert.equal(resolveWalletCreditMethodLabel("cash"), "espèces")
  assert.equal(resolveWalletCreditMethodLabel("bank_transfer"), "virement bancaire")
  assert.equal(resolveWalletCreditMethodLabel("postal_transfer"), "virement postal")
  assert.equal(resolveWalletCreditMethodLabel("postal_mandate"), "mandat postal")
  assert.equal(resolveWalletCreditMethodLabel("check"), "chèque")
  assert.equal(resolveWalletCreditMethodLabel("card_international"), "carte internationale")
})

test("resolveWalletCreditMethodLabel : traduit le crédit direct admin", () => {
  assert.equal(resolveWalletCreditMethodLabel("ADMIN_DIRECT"), "crédit direct admin")
})

test("resolveWalletCreditMethodLabel : traduit un provider PSP webhook générique", () => {
  assert.equal(resolveWalletCreditMethodLabel("PSP_STRIPE"), "paiement en ligne (STRIPE)")
  assert.equal(resolveWalletCreditMethodLabel("PSP_SPS"), "paiement en ligne (SPS)")
})

test("resolveWalletCreditMethodLabel : jamais de valeur vide — fallback au code brut si inconnu", () => {
  assert.equal(resolveWalletCreditMethodLabel("UNKNOWN_METHOD"), "UNKNOWN_METHOD")
})
