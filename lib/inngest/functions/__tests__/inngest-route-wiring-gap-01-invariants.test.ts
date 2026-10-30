/**
 * INNGEST-ROUTE-WIRING-GAP-01 — invariants statiques de câblage route.ts.
 *
 * Ces 4 fonctions étaient exportées depuis lib/inngest/functions/index.ts
 * mais jamais enregistrées dans app/api/inngest/route.ts. Sans
 * enregistrement, Inngest cloud les ignore silencieusement.
 *
 * Invariants vérifiés pour chaque fonction :
 *  A. Écoute le bon événement (trigger).
 *  B. onFailure câblé avec makeOnFailure(id).
 *  C. Exportée depuis l'index barrel.
 *  D. Importée dans app/api/inngest/route.ts.
 *  E. Présente dans le tableau functions de route.ts.
 *
 * Invariants spécifiques :
 *  F. processPackageConfirmed — step generate-invoice + RESEND guard.
 *  G. processActivityConfirmed — step send-activity-email + RESEND guard.
 *  H. processCarConfirmed — step generate-invoice présent.
 *  I. deliverCampaign — step deliver-messages délègue à deliverCampaignCore.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()

const routeSrc = readFileSync(join(ROOT, "app/api/inngest/route.ts"), "utf8")
const indexSrc = readFileSync(
  join(ROOT, "lib/inngest/functions/index.ts"),
  "utf8",
)
const packageSrc = readFileSync(
  join(ROOT, "lib/inngest/functions/process-package-confirmed.ts"),
  "utf8",
)
const activitySrc = readFileSync(
  join(ROOT, "lib/inngest/functions/process-activity-confirmed.ts"),
  "utf8",
)
const carSrc = readFileSync(
  join(ROOT, "lib/inngest/functions/process-car-confirmed.ts"),
  "utf8",
)
const campaignSrc = readFileSync(
  join(ROOT, "lib/inngest/functions/deliver-campaign.ts"),
  "utf8",
)

// ─── processPackageConfirmed ──────────────────────────────────────────────────

test('INNGEST-ROUTE-WIRING-GAP-01 : processPackageConfirmed écoute "booking/package.confirmed"', () => {
  assert.match(packageSrc, /"booking\/package\.confirmed"/)
})

test('INNGEST-ROUTE-WIRING-GAP-01 : processPackageConfirmed — onFailure câblé avec makeOnFailure("process-package-confirmed")', () => {
  assert.match(
    packageSrc,
    /onFailure:\s*makeOnFailure\("process-package-confirmed"\)/,
  )
})

test("INNGEST-ROUTE-WIRING-GAP-01 : processPackageConfirmed — step send-package-email + RESEND guard", () => {
  assert.match(packageSrc, /["']send-package-email["']/)
  // OMRA-PACKAGE-NOTIFY-RELIABILITY-01 : la garde RESEND_API_KEY est dans
  // sendEmailOnce (lib/inngest/send-email-once.ts), derrière l'envoi unique.
  assert.match(packageSrc, /sendEmailOnce\(\{/)
  assert.match(packageSrc, /action:\s*PACKAGE_EMAIL_SENT_ACTION/)
})

test("INNGEST-ROUTE-WIRING-GAP-01 : processPackageConfirmed — step generate-invoice + generateInvoiceForReservation", () => {
  assert.match(packageSrc, /["']generate-invoice["']/)
  assert.match(packageSrc, /generateInvoiceForReservation\(/)
})

test("INNGEST-ROUTE-WIRING-GAP-01 : processPackageConfirmed exportée depuis l'index barrel", () => {
  assert.match(
    indexSrc,
    /processPackageConfirmed.*from.*process-package-confirmed/,
  )
})

test("INNGEST-ROUTE-WIRING-GAP-01 : processPackageConfirmed importée dans app/api/inngest/route.ts", () => {
  assert.match(routeSrc, /processPackageConfirmed/)
})

test("INNGEST-ROUTE-WIRING-GAP-01 : processPackageConfirmed dans le tableau functions de route.ts", () => {
  const functionsBlockIdx = routeSrc.indexOf("functions: [")
  assert.match(routeSrc.slice(functionsBlockIdx), /processPackageConfirmed,/)
})

// ─── processActivityConfirmed ─────────────────────────────────────────────────

test('INNGEST-ROUTE-WIRING-GAP-01 : processActivityConfirmed écoute "booking/activity.confirmed"', () => {
  assert.match(activitySrc, /"booking\/activity\.confirmed"/)
})

test('INNGEST-ROUTE-WIRING-GAP-01 : processActivityConfirmed — onFailure câblé avec makeOnFailure("process-activity-confirmed")', () => {
  assert.match(
    activitySrc,
    /onFailure:\s*makeOnFailure\("process-activity-confirmed"\)/,
  )
})

test("INNGEST-ROUTE-WIRING-GAP-01 : processActivityConfirmed — step send-activity-email + RESEND guard", () => {
  assert.match(activitySrc, /["']send-activity-email["']/)
  assert.match(activitySrc, /process\.env\.RESEND_API_KEY/)
})

test("INNGEST-ROUTE-WIRING-GAP-01 : processActivityConfirmed exportée depuis l'index barrel", () => {
  assert.match(
    indexSrc,
    /processActivityConfirmed.*from.*process-activity-confirmed/,
  )
})

test("INNGEST-ROUTE-WIRING-GAP-01 : processActivityConfirmed importée dans app/api/inngest/route.ts", () => {
  assert.match(routeSrc, /processActivityConfirmed/)
})

test("INNGEST-ROUTE-WIRING-GAP-01 : processActivityConfirmed dans le tableau functions de route.ts", () => {
  const functionsBlockIdx = routeSrc.indexOf("functions: [")
  assert.match(routeSrc.slice(functionsBlockIdx), /processActivityConfirmed,/)
})

// ─── processCarConfirmed ──────────────────────────────────────────────────────

test('INNGEST-ROUTE-WIRING-GAP-01 : processCarConfirmed écoute "booking/car.confirmed"', () => {
  assert.match(carSrc, /"booking\/car\.confirmed"/)
})

test('INNGEST-ROUTE-WIRING-GAP-01 : processCarConfirmed — onFailure câblé avec makeOnFailure("process-car-confirmed")', () => {
  assert.match(carSrc, /onFailure:\s*makeOnFailure\("process-car-confirmed"\)/)
})

test("INNGEST-ROUTE-WIRING-GAP-01 : processCarConfirmed — step generate-invoice + generateInvoiceForReservation", () => {
  assert.match(carSrc, /["']generate-invoice["']/)
  assert.match(carSrc, /generateInvoiceForReservation\(/)
})

test("INNGEST-ROUTE-WIRING-GAP-01 : processCarConfirmed exportée depuis l'index barrel", () => {
  assert.match(indexSrc, /processCarConfirmed.*from.*process-car-confirmed/)
})

test("INNGEST-ROUTE-WIRING-GAP-01 : processCarConfirmed importée dans app/api/inngest/route.ts", () => {
  assert.match(routeSrc, /processCarConfirmed/)
})

test("INNGEST-ROUTE-WIRING-GAP-01 : processCarConfirmed dans le tableau functions de route.ts", () => {
  const functionsBlockIdx = routeSrc.indexOf("functions: [")
  assert.match(routeSrc.slice(functionsBlockIdx), /processCarConfirmed,/)
})

// ─── deliverCampaign ──────────────────────────────────────────────────────────

test('INNGEST-ROUTE-WIRING-GAP-01 : deliverCampaign écoute "crm/campaign.launched"', () => {
  assert.match(campaignSrc, /"crm\/campaign\.launched"/)
})

test('INNGEST-ROUTE-WIRING-GAP-01 : deliverCampaign — onFailure câblé avec makeOnFailure("deliver-campaign")', () => {
  // CRM-CAMPAIGN-SAFETY-01 : onFailure observe (makeOnFailure) PUIS passe
  // les cibles encore 'pending' à 'failed' après la dernière tentative.
  assert.match(campaignSrc, /makeOnFailure\("deliver-campaign"\)/)
  assert.match(campaignSrc, /onFailure:\s*async/)
  assert.match(campaignSrc, /markRemainingTargetsFailedCore/)
})

test("INNGEST-ROUTE-WIRING-GAP-01 : deliverCampaign — step deliver-messages délègue à deliverCampaignCore", () => {
  assert.match(campaignSrc, /["']deliver-messages["']/)
  assert.match(campaignSrc, /deliverCampaignCore/)
})

test("INNGEST-ROUTE-WIRING-GAP-01 : deliverCampaign exportée depuis l'index barrel", () => {
  assert.match(indexSrc, /deliverCampaign.*from.*deliver-campaign/)
})

test("INNGEST-ROUTE-WIRING-GAP-01 : deliverCampaign importée dans app/api/inngest/route.ts", () => {
  assert.match(routeSrc, /deliverCampaign/)
})

test("INNGEST-ROUTE-WIRING-GAP-01 : deliverCampaign dans le tableau functions de route.ts", () => {
  const functionsBlockIdx = routeSrc.indexOf("functions: [")
  assert.match(routeSrc.slice(functionsBlockIdx), /deliverCampaign,/)
})
