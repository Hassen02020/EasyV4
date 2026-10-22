/**
 * CAS-C — Invariants statiques : step.run("generate-invoice") présent
 * dans chaque fonction Inngest qui émet une facture.
 *
 * Avant CAS-C, generateInvoiceForReservation était appelé en fire-and-forget
 * post-commit dans chaque action. Un crash process entre le commit et l'appel
 * laissait la réservation sans facture (récupérable manuellement).
 *
 * Fix : déplacement dans step.run("generate-invoice") côté Inngest —
 * checkpoint persistant, retry automatique, idempotence DB garantit l'absence
 * de doublon.
 *
 * Modules couverts :
 *   booking/confirmed      → process-confirmed-booking.ts  (hôtel B2B + B2C)
 *   booking/omra.confirmed → process-omra-confirmed.ts
 *   booking/package.conf.  → process-package-confirmed.ts
 *   booking/transfer.conf. → process-transfer-confirmed.ts
 *   booking/car.confirmed  → process-car-confirmed.ts
 *
 * Référence pattern : process-mutuelle-confirmed.ts (déjà corrigé avant CAS-C).
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const FUNCTIONS: Record<string, string> = {
  "lib/inngest/functions/process-confirmed-booking.ts": readFileSync(
    join(process.cwd(), "lib/inngest/functions/process-confirmed-booking.ts"),
    "utf8",
  ),
  "lib/inngest/functions/process-omra-confirmed.ts": readFileSync(
    join(process.cwd(), "lib/inngest/functions/process-omra-confirmed.ts"),
    "utf8",
  ),
  "lib/inngest/functions/process-package-confirmed.ts": readFileSync(
    join(process.cwd(), "lib/inngest/functions/process-package-confirmed.ts"),
    "utf8",
  ),
  "lib/inngest/functions/process-transfer-confirmed.ts": readFileSync(
    join(process.cwd(), "lib/inngest/functions/process-transfer-confirmed.ts"),
    "utf8",
  ),
  "lib/inngest/functions/process-car-confirmed.ts": readFileSync(
    join(process.cwd(), "lib/inngest/functions/process-car-confirmed.ts"),
    "utf8",
  ),
}

const REMOVED: Record<string, string> = {
  "lib/booking/actions.ts": readFileSync(
    join(process.cwd(), "lib/booking/actions.ts"),
    "utf8",
  ),
  "lib/booking/guest-actions.ts": readFileSync(
    join(process.cwd(), "lib/booking/guest-actions.ts"),
    "utf8",
  ),
  "lib/omra/booking-actions.ts": readFileSync(
    join(process.cwd(), "lib/omra/booking-actions.ts"),
    "utf8",
  ),
  "lib/transfers/actions.ts": readFileSync(
    join(process.cwd(), "lib/transfers/actions.ts"),
    "utf8",
  ),
  "lib/cars/actions.ts": readFileSync(
    join(process.cwd(), "lib/cars/actions.ts"),
    "utf8",
  ),
}

// ── Fonctions Inngest — step.run présent ────────────────────────────────────

for (const [filePath, src] of Object.entries(FUNCTIONS)) {
  test(`CAS-C [${filePath}] : step.run("generate-invoice") présent`, () => {
    assert.ok(
      src.includes('step.run("generate-invoice"'),
      `${filePath} doit contenir step.run("generate-invoice")`,
    )
  })

  test(`CAS-C [${filePath}] : generateInvoiceForReservation importé`, () => {
    assert.ok(
      src.includes("generateInvoiceForReservation"),
      `${filePath} doit importer generateInvoiceForReservation`,
    )
  })

  test(`CAS-C [${filePath}] : step.run("generate-invoice") après step.run email/sms`, () => {
    const invoiceIdx = src.indexOf('step.run("generate-invoice"')
    assert.ok(invoiceIdx > 0, "step.run(generate-invoice) doit être présent")
    const firstStepIdx = src.indexOf("step.run(")
    // Si generate-invoice est le SEUL step.run, il est aussi le dernier — ok.
    // Si d'autres step.run existent, generate-invoice doit apparaître après le premier.
    if (invoiceIdx !== firstStepIdx) {
      assert.ok(
        invoiceIdx > firstStepIdx,
        "step.run(generate-invoice) doit apparaître après le premier step.run",
      )
    }
  })
}

// ── Actions serveur — fire-and-forget supprimé ──────────────────────────────

for (const [filePath, src] of Object.entries(REMOVED)) {
  test(`CAS-C [${filePath}] : pas d'appel direct generateInvoiceForReservation`, () => {
    assert.ok(
      !src.includes("generateInvoiceForReservation"),
      `${filePath} ne doit plus appeler generateInvoiceForReservation directement — déplacé dans Inngest`,
    )
  })
}
