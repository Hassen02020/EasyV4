/**
 * VOUCHER-CAR-TRANSFER-DATA-01 (lot "transfer") — conversion date + heure
 * locales tunisiennes → instant UTC. Indépendante du fuseau du processus.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import {
  buildTransferPickupAt,
  formatTransferPickupAt,
} from "@/lib/transfers/pickup-at"

test("heure murale Tunis (UTC+1) → instant UTC", () => {
  assert.equal(
    buildTransferPickupAt("2026-11-03", "14:30")?.toISOString(),
    "2026-11-03T13:30:00.000Z",
  )
  // Été : la Tunisie n'a pas d'heure d'été, le décalage reste +1.
  assert.equal(
    buildTransferPickupAt("2026-07-15", "09:00")?.toISOString(),
    "2026-07-15T08:00:00.000Z",
  )
})

test("minuit et passage de jour : 00:30 Tunis = 23:30 UTC la veille", () => {
  assert.equal(
    buildTransferPickupAt("2026-11-03", "00:30")?.toISOString(),
    "2026-11-02T23:30:00.000Z",
  )
  assert.equal(
    buildTransferPickupAt("2026-12-31", "23:59")?.toISOString(),
    "2026-12-31T22:59:00.000Z",
  )
})

test("date ou heure invalide → null (jamais de valeur devinée)", () => {
  for (const [d, t] of [
    ["2026-02-30", "10:00"],
    ["2026-13-01", "10:00"],
    ["2026-11-03", "24:00"],
    ["2026-11-03", "10:60"],
    ["2026-11-3", "10:00"],
    ["03/11/2026", "10:00"],
    ["2026-11-03", "9:00"],
    ["2026-11-03", ""],
    ["", "10:00"],
  ] as const) {
    assert.equal(buildTransferPickupAt(d, t), null, `${d} ${t}`)
  }
})

test("résultat identique quel que soit le fuseau du processus (TZ)", () => {
  const script = `
    require("tsx/cjs");
    const { buildTransferPickupAt } = require("./lib/transfers/pickup-at.ts");
    process.stdout.write(buildTransferPickupAt("2026-11-03","14:30").toISOString());
  `
  for (const tz of ["UTC", "America/New_York", "Asia/Tokyo", "Africa/Tunis"]) {
    const out = execFileSync(process.execPath, ["-e", script], {
      env: { ...process.env, TZ: tz },
      cwd: process.cwd(),
    }).toString()
    assert.equal(out, "2026-11-03T13:30:00.000Z", `TZ=${tz}`)
  }
})

test("affichage : instant UTC → heure de Tunis ; ancienne chaîne sans fuseau affichée telle quelle", () => {
  const shown = formatTransferPickupAt("2026-11-03T13:30:00.000Z", "fr-FR")
  assert.match(shown, /14:30/)
  // Événement antérieur à ce lot : heure murale déjà locale, non décalée.
  assert.match(formatTransferPickupAt("2026-11-03T14:30:00", "fr-FR"), /14:30/)
  assert.equal(formatTransferPickupAt("n'importe quoi"), "n'importe quoi")
})
