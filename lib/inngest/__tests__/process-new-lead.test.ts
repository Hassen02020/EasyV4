/**
 * CRM-NOTIFY-01 — Invariants statiques : processNewLead + submitLead
 *
 * N01 — processNewLead est bien exporté depuis le barrel functions/index.ts
 * N02 — processNewLead est enregistré dans la route API Inngest
 * N03 — l'event "crm/lead.created" est déclaré dans Events (client Inngest)
 * N04 — submitLead importe sendEvent (câblage notification)
 * N05 — processNewLead utilise agencies.contactEmail (pas une adresse codée en dur)
 * N06 — processNewLead retourne { success: false } si agencies.email absent (pas de throw)
 * N07 — l'email Inngest est non-fatal dans submitLead (catch sur sendEvent)
 * N08 — resolveProductLabel retourne le label produit enrichi si productLabel fourni
 * N09 — resolveProductLabel retourne le type seul si productLabel absent
 * N10 — PRODUCT_TYPE_LABEL couvre tous les types de LeadProductType
 */

import * as assert from "node:assert/strict"
import { describe, it } from "node:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()

function readSrc(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8")
}

describe("CRM-NOTIFY-01 — processNewLead invariants", () => {
  it("N01 — processNewLead exporté depuis functions/index.ts", () => {
    const src = readSrc("lib/inngest/functions/index.ts")
    assert.ok(
      src.includes("processNewLead"),
      "processNewLead absent du barrel export",
    )
  })

  it("N02 — processNewLead enregistré dans /api/inngest/route.ts", () => {
    const src = readSrc("app/api/inngest/route.ts")
    assert.ok(
      src.includes("processNewLead"),
      "processNewLead absent de la route API Inngest",
    )
  })

  it('N03 — event "crm/lead.created" déclaré dans Events', () => {
    const src = readSrc("lib/inngest/client.ts")
    assert.ok(
      src.includes('"crm/lead.created"'),
      '"crm/lead.created" absent du type Events',
    )
    assert.ok(
      src.includes("leadId"),
      "champ leadId absent du type de l'event crm/lead.created",
    )
  })

  it("N04 — submitLead importe sendEvent", () => {
    const src = readSrc("app/actions/submit-lead.ts")
    assert.ok(
      src.includes("sendEvent"),
      "sendEvent non importé dans submitLead",
    )
    assert.ok(
      src.includes('"crm/lead.created"'),
      "submitLead n'émet pas l'event \"crm/lead.created\"",
    )
  })

  it("N05 — processNewLead utilise agencies.contactEmail (pas de hardcode)", () => {
    const src = readSrc("lib/inngest/functions/process-new-lead.ts")
    assert.ok(
      src.includes("contactEmail"),
      "processNewLead ne lit pas agencies.contactEmail",
    )
    // Aucune adresse email codée en dur comme destinataire (seulement l'adresse expéditeur noreply@)
    const hardcodedRecipient = src.match(
      /to:\s*["'](?!noreply@)[^@"']+@[^"']+["']/,
    )
    assert.ok(
      !hardcodedRecipient,
      `Adresse destinataire codée en dur trouvée : ${hardcodedRecipient?.[0]}`,
    )
  })

  it("N06 — processNewLead gère l'absence d'email agence sans throw", () => {
    const src = readSrc("lib/inngest/functions/process-new-lead.ts")
    assert.ok(
      src.includes("no_agency_email"),
      "processNewLead ne gère pas le cas agencies.email absent",
    )
    // La fonction doit retourner { success: false } et non throw
    assert.ok(
      src.includes("return { success: false"),
      "processNewLead throw au lieu de retourner { success: false } quand email absent",
    )
  })

  it("N07 — sendEvent est non-fatal dans submitLead (catch présent)", () => {
    const src = readSrc("app/actions/submit-lead.ts")
    assert.ok(
      src.includes(".catch("),
      "l'appel sendEvent dans submitLead n'est pas protégé par .catch()",
    )
  })

  it("N08 — resolveProductLabel retourne type + label si productLabel fourni", () => {
    // Import dynamique du helper depuis process-new-lead.ts
    const src = readSrc("lib/inngest/functions/process-new-lead.ts")
    assert.ok(
      src.includes("productLabel ? `${typeLabel} — ${productLabel}`"),
      "resolveProductLabel ne concatène pas type et label quand productLabel fourni",
    )
  })

  it("N09 — resolveProductLabel retourne typeLabel seul si productLabel absent", () => {
    const src = readSrc("lib/inngest/functions/process-new-lead.ts")
    assert.ok(
      src.includes(": typeLabel"),
      "resolveProductLabel ne retourne pas typeLabel seul quand productLabel absent",
    )
  })

  it("N10 — PRODUCT_TYPE_LABEL couvre les 5 types LeadProductType", () => {
    const src = readSrc("lib/inngest/functions/process-new-lead.ts")
    for (const type of ["hotel", "omra", "package", "activity", "general"]) {
      assert.ok(
        src.includes(`${type}:`),
        `PRODUCT_TYPE_LABEL ne contient pas le type "${type}"`,
      )
    }
  })
})
