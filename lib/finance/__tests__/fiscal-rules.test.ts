/**
 * FISCAL-RULES-01 — Tests moteur de règles fiscales (TAX-RULES-SUPERADMIN-01, LOT 5).
 *
 * Couverture :
 *  T1–T4  : FiscalSnapshot builders avec fiscal_rule_id/version
 *  T5–T7  : buildPendingFiscalSnapshot (car, transfer, flight)
 *  T8     : Omra utilise buildPendingFiscalSnapshot
 *  T9     : fiscal_classification distinct de vatRate
 *  T10    : Wiring — getActiveFiscalRule implémente la résolution 4-passes
 *  T11    : Wiring — advisory lock dans activateFiscalRule
 *  T12    : Wiring — overlap check dans activateFiscalRule
 *  T13    : Wiring — validationRef requis à l'activation
 *  T14    : Wiring — super_admin uniquement pour les écritures
 *  T15    : Wiring — fiscal_rule_id/version propagés dans les builders
 *  T16    : fiscal_rule_id = null pour les snapshots pending
 *  T17    : Wiring — omra corrigé (fiscalSnapshot dans INSERT)
 *  T18–T22: Wiring LOT 6 — call-sites hotel/package/activity fail-closed,
 *           car/transfer/flight pending-fallback
 */

import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import {
  buildFiscalSnapshot,
  buildFiscalSnapshotFromTtc,
  buildPendingFiscalSnapshot,
  computePriceBreakdown,
} from "@/lib/booking/pricing"

const ROOT = resolve(__dirname, "../../..")

function readSrc(rel: string) {
  return readFileSync(resolve(ROOT, rel), "utf8")
}

// ---------------------------------------------------------------------------
// T1–T4 : Builders avec fiscal_rule_id / fiscal_rule_version
// ---------------------------------------------------------------------------

describe("FISCAL-RULES-01 : builders", () => {
  const breakdown = computePriceBreakdown({
    unitPriceTnd: 1000,
    adults: 1,
    vatRate: 19,
    depositPercent: 100,
  })

  test("T1 — buildFiscalSnapshot HT, taux 19 %, fiscal_rule_id propagé", () => {
    const snap = buildFiscalSnapshot(
      breakdown,
      19,
      "hotel",
      "ref-v1",
      "note",
      "uuid-rule-1",
      2,
    )
    assert.equal(snap.status, "determined")
    assert.equal(snap.vatRate, 19)
    assert.equal(snap.taxBasis, "HT")
    assert.equal(snap.subtotalTnd, 1000)
    assert.equal(snap.vatTnd, 190)
    assert.equal(snap.totalTnd, 1190)
    assert.equal(snap.serviceCategory, "hotel")
    assert.equal(snap.fiscal_rule_id, "uuid-rule-1")
    assert.equal(snap.fiscal_rule_version, 2)
  })

  test("T2 — buildFiscalSnapshotFromTtc, taux 19 %, TTC 590", () => {
    const snap = buildFiscalSnapshotFromTtc(
      590,
      19,
      "package",
      "ref-pkg",
      null,
      "uuid-rule-pkg",
      1,
    )
    assert.equal(snap.status, "determined")
    assert.equal(snap.taxBasis, "TTC")
    assert.equal(snap.totalTnd, 590)
    // HT = 590 / 1.19 ≈ 495.80, TVA ≈ 94.20
    assert.ok(Math.abs(snap.subtotalTnd! - 495.8) < 0.01, `subtotalTnd=${snap.subtotalTnd}`)
    assert.ok(Math.abs(snap.vatTnd! - 94.2) < 0.01, `vatTnd=${snap.vatTnd}`)
    assert.equal(snap.fiscal_rule_id, "uuid-rule-pkg")
    assert.equal(snap.fiscal_rule_version, 1)
  })

  test("T3 — buildFiscalSnapshot taux 0 % (zero_rated), vatTnd = 0", () => {
    const bd = computePriceBreakdown({
      unitPriceTnd: 1000,
      adults: 1,
      vatRate: 0,
      depositPercent: 100,
    })
    const snap = buildFiscalSnapshot(bd, 0, "activity", null, null, "uuid-rule-zero", 1)
    assert.equal(snap.status, "determined")
    assert.equal(snap.vatRate, 0)
    assert.equal(snap.vatTnd, 0)
    assert.equal(snap.fiscal_rule_id, "uuid-rule-zero")
  })

  test("T4 — buildFiscalSnapshot sans fiscal_rule_id (ancien call-site compatible)", () => {
    const snap = buildFiscalSnapshot(
      breakdown,
      19,
      "hotel",
      null,
      "taux_provisoire_19_pct",
    )
    assert.equal(snap.fiscal_rule_id, null)
    assert.equal(snap.fiscal_rule_version, null)
  })
})

// ---------------------------------------------------------------------------
// T5–T7 : buildPendingFiscalSnapshot
// ---------------------------------------------------------------------------

describe("FISCAL-RULES-01 : pending snapshot", () => {
  test("T5 — car : status pending, fiscal_rule_id null", () => {
    const snap = buildPendingFiscalSnapshot(450, "car_rental", "taux_non_déterminé")
    assert.equal(snap.status, "pending")
    assert.equal(snap.vatRate, null)
    assert.equal(snap.vatTnd, null)
    assert.equal(snap.fiscal_rule_id, null)
    assert.equal(snap.fiscal_rule_version, null)
    assert.equal(snap.totalTnd, 450)
  })

  test("T6 — transfer : status pending", () => {
    const snap = buildPendingFiscalSnapshot(200, "transfer", "taux_non_déterminé")
    assert.equal(snap.status, "pending")
    assert.equal(snap.fiscal_rule_id, null)
  })

  test("T7 — flight : status pending", () => {
    const snap = buildPendingFiscalSnapshot(1200, "flight", "taux_non_déterminé")
    assert.equal(snap.status, "pending")
    assert.equal(snap.fiscal_rule_id, null)
  })
})

// ---------------------------------------------------------------------------
// T8 : Omra corrigé — buildPendingFiscalSnapshot présent dans booking-actions
// ---------------------------------------------------------------------------

describe("FISCAL-RULES-01 : omra correction", () => {
  const omraSrc = readSrc("lib/omra/booking-actions.ts")

  test("T8 — omra : buildPendingFiscalSnapshot importé et utilisé dans INSERT", () => {
    assert.match(omraSrc, /buildPendingFiscalSnapshot/, "import manquant")
    assert.match(omraSrc, /fiscalSnapshot:\s*buildPendingFiscalSnapshot/, "call INSERT manquant")
    assert.match(omraSrc, /["']omra["']/, "serviceCategory 'omra' manquante")
  })
})

// ---------------------------------------------------------------------------
// T9 : fiscal_classification distinct de vatRate dans le schéma
// ---------------------------------------------------------------------------

describe("FISCAL-RULES-01 : fiscal_classification dans le schéma", () => {
  const schemaFin = readSrc("lib/db/schema/financials.ts")

  test("T9 — fiscal_classification présent (standard/zero_rated/exempt/out_of_scope)", () => {
    assert.match(schemaFin, /fiscal_classification/)
    assert.match(schemaFin, /zero_rated/)
    assert.match(schemaFin, /exempt/)
    assert.match(schemaFin, /out_of_scope/)
  })
})

// ---------------------------------------------------------------------------
// T10 : Wiring — 4-pass wildcard dans getActiveFiscalRule
// ---------------------------------------------------------------------------

describe("FISCAL-RULES-01 : fiscal-rules.ts wiring", () => {
  const src = readSrc("lib/finance/fiscal-rules.ts")

  test("T10 — résolution 4-passes wildcard implémentée", () => {
    // Les 4 combinaisons country/module doivent être présentes
    assert.match(src, /\[country, module\]/, "Pass 1 (exact+exact) manquante")
    assert.match(src, /\[country, "\*"\]/, "Pass 2 (exact+wildcard) manquante")
    assert.match(src, /\["\*", module\]/, "Pass 3 (wildcard+exact) manquante")
    assert.match(src, /\["\*", "\*"\]/, "Pass 4 (wildcard+wildcard) manquante")
    // Filtre status=active + effectiveFrom <= atDate
    assert.match(src, /status.*active/)
    assert.match(src, /effectiveFrom/)
    // effectiveTo nul ou dans le futur
    assert.match(src, /isNull|effectiveTo/)
  })
})

// ---------------------------------------------------------------------------
// T11–T14 : Wiring — fiscal-rules-actions.ts
// ---------------------------------------------------------------------------

describe("FISCAL-RULES-01 : fiscal-rules-actions.ts wiring", () => {
  const src = readSrc("lib/finance/fiscal-rules-actions.ts")

  test("T11 — advisory lock pg_advisory_xact_lock acquis dans activateFiscalRule", () => {
    assert.match(src, /pg_advisory_xact_lock/)
    assert.match(src, /hashtext/)
    // La clé doit combiner country et module
    assert.match(src, /country.*module|country.*:.*module/)
  })

  test("T12 — contrôle de chevauchement dans la même transaction que l'activation", () => {
    assert.match(src, /FISCAL_RULE_OVERLAP/)
    // Le chevauchement doit être vérifié AVANT l'update d'activation
    const overlapIdx = src.indexOf("FISCAL_RULE_OVERLAP")
    const activateIdx = src.indexOf('status: "active"')
    assert.ok(
      overlapIdx < activateIdx,
      "Le contrôle overlap doit précéder l'activation dans le code",
    )
  })

  test("T13 — validationRef obligatoire à l'activation", () => {
    assert.match(src, /validationRef/)
    assert.match(src, /VALIDATION_REF_REQUIRED/)
  })

  test("T14 — isSuperAdmin vérifié pour createDraftFiscalRule et activateFiscalRule", () => {
    const createIdx = src.indexOf("createDraftFiscalRule")
    const activateIdx = src.indexOf("activateFiscalRule")
    // Les deux fonctions doivent vérifier isSuperAdmin
    const superAdminChecks = [...src.matchAll(/isSuperAdmin/g)].map(
      (m) => m.index ?? 0,
    )
    const checkAfterCreate = superAdminChecks.some((i) => i > createIdx)
    const checkAfterActivate = superAdminChecks.some((i) => i > activateIdx)
    assert.ok(
      checkAfterCreate,
      "isSuperAdmin non vérifié dans createDraftFiscalRule",
    )
    assert.ok(
      checkAfterActivate,
      "isSuperAdmin non vérifié dans activateFiscalRule",
    )
  })
})

// ---------------------------------------------------------------------------
// T15–T16 : fiscal_rule_id / version dans les builders
// ---------------------------------------------------------------------------

describe("FISCAL-RULES-01 : fiscal_rule_id dans FiscalSnapshot", () => {
  const pricingSrc = readSrc("lib/booking/pricing.ts")

  test("T15 — FiscalSnapshot type contient fiscal_rule_id et fiscal_rule_version", () => {
    assert.match(pricingSrc, /fiscal_rule_id/)
    assert.match(pricingSrc, /fiscal_rule_version/)
  })

  test("T16 — buildPendingFiscalSnapshot retourne fiscal_rule_id: null", () => {
    const snap = buildPendingFiscalSnapshot(100, "omra", "taux_non_déterminé")
    assert.equal(snap.fiscal_rule_id, null)
    assert.equal(snap.fiscal_rule_version, null)
  })
})

// ---------------------------------------------------------------------------
// T17 : schema.ts exporte fiscalRules
// ---------------------------------------------------------------------------

describe("FISCAL-RULES-01 : schema export", () => {
  const schemaSrc = readSrc("lib/db/schema.ts")

  test("T17 — fiscalRules exporté depuis schema.ts", () => {
    assert.match(schemaSrc, /fiscalRules/)
    assert.match(schemaSrc, /FiscalRule/)
  })
})

// ---------------------------------------------------------------------------
// T18–T22 : Wiring LOT 6 — call-sites fail-closed et pending-fallback
// ---------------------------------------------------------------------------

describe("FISCAL-RULES-01 LOT 6 : wiring call-sites", () => {
  const hotelB2B = readSrc("lib/booking/actions.ts")
  const hotelB2C = readSrc("lib/booking/guest-actions.ts")
  const pkgActions = readSrc("lib/packages/booking-actions.ts")
  const activityB2B = readSrc("lib/activities/booking-actions.ts")
  const activityB2C = readSrc("lib/activities/guest-booking-actions.ts")
  const cars = readSrc("lib/cars/actions.ts")
  const transfers = readSrc("lib/transfers/actions.ts")
  const flights = readSrc("lib/vols/booking-request-action.ts")

  test("T18 — hotel B2B+B2C importent getActiveFiscalRuleInTx et échouent si pas de règle", () => {
    assert.match(hotelB2B, /getActiveFiscalRuleInTx/)
    assert.match(hotelB2B, /FISCAL_RULE_NOT_FOUND/)
    assert.match(hotelB2C, /getActiveFiscalRuleInTx/)
    assert.match(hotelB2C, /FISCAL_RULE_NOT_FOUND/)
  })

  test("T19 — packages B2B+B2C importent getActiveFiscalRuleInTx et échouent si pas de règle", () => {
    assert.match(pkgActions, /getActiveFiscalRuleInTx/)
    assert.match(pkgActions, /FISCAL_RULE_NOT_FOUND/)
  })

  test("T20 — activités B2B+B2C importent getActiveFiscalRuleInTx et échouent si pas de règle", () => {
    assert.match(activityB2B, /getActiveFiscalRuleInTx/)
    assert.match(activityB2B, /FISCAL_RULE_NOT_FOUND/)
    assert.match(activityB2C, /getActiveFiscalRuleInTx/)
    assert.match(activityB2C, /FISCAL_RULE_NOT_FOUND/)
  })

  test("T21 — car et transfer importent getActiveFiscalRuleInTx avec fallback pending", () => {
    assert.match(cars, /getActiveFiscalRuleInTx/)
    assert.match(cars, /buildPendingFiscalSnapshot/)
    assert.match(transfers, /getActiveFiscalRuleInTx/)
    assert.match(transfers, /buildPendingFiscalSnapshot/)
  })

  test("T22 — vols importent getActiveFiscalRuleInTx avec fallback pending", () => {
    assert.match(flights, /getActiveFiscalRuleInTx/)
    assert.match(flights, /buildPendingFiscalSnapshot/)
  })
})
