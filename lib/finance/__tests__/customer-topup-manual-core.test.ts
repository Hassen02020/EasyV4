import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import {
  isMethodConfigComplete,
  normalizeMethodDetails,
  parseTopupAmount,
} from "@/lib/finance/customer-topup-manual-core"

test("parseTopupAmount : deux décimales au plus, jamais d'arrondi", () => {
  assert.deepEqual(parseTopupAmount("10"), {
    ok: true,
    amount: "10.00",
    amountTnd: 10,
  })
  assert.deepEqual(parseTopupAmount("150,5"), {
    ok: true,
    amount: "150.50",
    amountTnd: 150.5,
  })
  assert.deepEqual(parseTopupAmount(4999.99), {
    ok: true,
    amount: "4999.99",
    amountTnd: 4999.99,
  })
  assert.deepEqual(parseTopupAmount("5000.00"), {
    ok: true,
    amount: "5000.00",
    amountTnd: 5000,
  })
  assert.deepEqual(parseTopupAmount("10.005"), {
    ok: false,
    code: "TOO_PRECISE",
  })
  assert.deepEqual(parseTopupAmount(10.001), { ok: false, code: "TOO_PRECISE" })
  assert.deepEqual(parseTopupAmount("9.99"), {
    ok: false,
    code: "OUT_OF_RANGE",
  })
  assert.deepEqual(parseTopupAmount("5000.01"), {
    ok: false,
    code: "OUT_OF_RANGE",
  })
  for (const bad of ["", "-10", "1e3", "10.", "abc", NaN, Infinity, null, {}]) {
    assert.deepEqual(
      parseTopupAmount(bad),
      { ok: false, code: "INVALID_AMOUNT" },
      String(bad),
    )
  }
})

test("coordonnées : obligatoires, format vérifié, champs inconnus ignorés", () => {
  const ok = normalizeMethodDetails("bank_transfer", {
    beneficiary: " Titulaire ",
    bank_name: "Banque",
    rib: "12 345 6789012345678 90",
    injected: "<script>",
  })
  assert.deepEqual(ok, {
    ok: true,
    complete: true,
    details: {
      beneficiary: "Titulaire",
      bank_name: "Banque",
      rib: "12345678901234567890",
    },
  })

  assert.deepEqual(
    normalizeMethodDetails("bank_transfer", { beneficiary: "Titulaire" }),
    { ok: true, complete: false, details: { beneficiary: "Titulaire" } },
  )
  const badRib = normalizeMethodDetails("bank_deposit", {
    beneficiary: "T",
    bank_name: "B",
    rib: "1234",
  })
  assert.equal(badRib.ok, false)
  const badD17 = normalizeMethodDetails("d17", {
    beneficiary: "T",
    d17_number: "12ab",
  })
  assert.equal(badD17.ok, false)

  assert.equal(isMethodConfigComplete("cash_agency", {}), false)
  assert.equal(
    isMethodConfigComplete("cash_agency", {
      agency_name: "Agence",
      address: "Adresse",
      opening_hours: "Horaires",
    }),
    true,
  )
})

test("aucune coordonnée codée en dur dans le module (RIB/D17 fournis par le super_admin)", () => {
  const src = readFileSync(
    join(process.cwd(), "lib/finance/customer-topup-manual-core.ts"),
    "utf8",
  )
  assert.doesNotMatch(src, /\b\d{20}\b/)
  assert.doesNotMatch(src, /\bTN\d{22}\b/)
})

test('actions serveur : modules "use server" n\'exportant que des fonctions async et des types', () => {
  for (const rel of [
    "lib/finance/b2c-topup-actions.ts",
    "lib/finance/b2c-topup-review-actions.ts",
    "lib/admin/topup-payment-methods-actions.ts",
  ]) {
    const src = readFileSync(join(process.cwd(), rel), "utf8")
    assert.match(src, /^"use server"/, rel)
    for (const e of src.match(/^export\s+(\S+\s+\S+)/gm) ?? []) {
      assert.match(
        e,
        /^export\s+(async function|type|interface)\b/,
        `${rel}: ${e}`,
      )
    }
  }
})

test("le validateur n'est jamais fourni par le client", () => {
  const src = readFileSync(
    join(process.cwd(), "lib/finance/b2c-topup-review-actions.ts"),
    "utf8",
  )
  assert.match(
    src,
    /export async function validateCustomerTopUp\(\s*requestId: string,\s*\)/,
  )
  assert.match(
    src,
    /export async function rejectCustomerTopUp\(\s*requestId: string,\s*reason: string,\s*\)/,
  )
  assert.match(src, /supabase\.auth\.getUser\(\)/)
})

test("chaque code d'erreur client a sa traduction FR/EN/AR (namespace Compte)", async () => {
  const {
    TOPUP_ERROR_LABEL_KEYS,
    TOPUP_METHOD_LABEL_KEYS,
    TOPUP_DETAIL_FIELDS,
  } = await import("@/lib/finance/topup-method-display")
  const keys = new Set<string>([
    ...Object.values(TOPUP_ERROR_LABEL_KEYS),
    ...Object.values(TOPUP_METHOD_LABEL_KEYS),
    ...TOPUP_DETAIL_FIELDS.map(([, k]) => k),
  ])
  for (const lang of ["fr", "en", "ar"]) {
    const compte = JSON.parse(
      readFileSync(join(process.cwd(), `messages/${lang}.json`), "utf8"),
    ).Compte as Record<string, string>
    for (const k of keys) {
      assert.ok(
        typeof compte[k] === "string" && compte[k].length > 0,
        `${lang}: clé manquante ${k}`,
      )
    }
  }
})
