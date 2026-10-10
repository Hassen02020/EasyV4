/**
 * CRM-STAFF-LEAD-01 — invariants statiques pour la saisie manuelle de lead
 * par le staff. Vérifie que agencyId/capturedByUserId sont résolus depuis la
 * session serveur (jamais fournis par le client), que "staff_manual_entry"
 * est bien la source utilisée, et que les deux rôles requis sont câblés.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const actionsPath = join(process.cwd(), "lib/admin/leads-actions.ts")
const corePath = join(process.cwd(), "lib/crm/staff-lead-capture-core.ts")

const actionsSrc = readFileSync(actionsPath, "utf8")
const coreSrc = readFileSync(corePath, "utf8")

// --------------------------------------------------------------------------
// Server Action wiring — leads-actions.ts
// --------------------------------------------------------------------------

test("createLead est exporté depuis leads-actions.ts", () => {
  assert.match(
    actionsSrc,
    /export async function createLead\s*\(/,
    "createLead doit être exporté",
  )
})

test("createLead importe captureStaffLeadCore (jamais createLeadCore directement)", () => {
  assert.match(
    actionsSrc,
    /import\s*\{[^}]*captureStaffLeadCore[^}]*\}\s*from/,
    "createLead doit déléguer à captureStaffLeadCore",
  )
  assert.doesNotMatch(
    actionsSrc,
    /import\s*\{[^}]*createLeadCore[^}]*\}\s*from/,
    "createLead ne doit pas importer createLeadCore directement",
  )
})

test("agencyId transmis depuis ctx.agencyId (session), jamais depuis input client", () => {
  assert.match(
    actionsSrc,
    /agencyId:\s*ctx\.agencyId/,
    "agencyId doit venir de ctx.agencyId résolu côté serveur",
  )
})

test("capturedByUserId transmis depuis ctx.userId (session), jamais depuis input", () => {
  assert.match(
    actionsSrc,
    /capturedByUserId:\s*ctx\.userId/,
    "capturedByUserId doit venir de ctx.userId (session serveur)",
  )
})

test("createLead valide firstName non vide avant d'écrire", () => {
  assert.match(
    actionsSrc,
    /firstName.*trim\(\)/,
    "firstName doit être trimmé et validé",
  )
  assert.match(
    actionsSrc,
    /Prénom requis/,
    "message d'erreur 'Prénom requis' attendu",
  )
})

test("createLead valide channel via CRM_CHANNELS avant d'écrire", () => {
  assert.match(
    actionsSrc,
    /CRM_CHANNELS.*includes\(input\.channel\)/,
    "channel doit être validé via CRM_CHANNELS",
  )
  assert.match(
    actionsSrc,
    /Canal invalide/,
    "message d'erreur 'Canal invalide' attendu",
  )
})

test("createLead appelle revalidatePath('/admin/support') après succès", () => {
  assert.match(
    actionsSrc,
    /revalidatePath\(["']\/admin\/support["']\)/,
    "revalidatePath('/admin/support') doit être appelé",
  )
})

// --------------------------------------------------------------------------
// Core wiring — staff-lead-capture-core.ts
// --------------------------------------------------------------------------

test("captureStaffLeadCore appelle createLeadCore", () => {
  assert.match(
    coreSrc,
    /await createLeadCore\s*\(/,
    "captureStaffLeadCore doit appeler createLeadCore",
  )
})

test("captureStaffLeadCore utilise source 'staff_manual_entry' pour role=channel", () => {
  assert.match(
    coreSrc,
    /source:\s*["']staff_manual_entry["']/,
    "source doit être 'staff_manual_entry'",
  )
})

test("captureStaffLeadCore câble role='channel' avec actorRef=params.channel", () => {
  assert.match(
    coreSrc,
    /role:\s*["']channel["']/,
    "role 'channel' doit être câblé",
  )
  assert.match(
    coreSrc,
    /actorRef:\s*params\.channel/,
    "actorRef du rôle channel doit être params.channel",
  )
})

test("captureStaffLeadCore câble role='captured_by_user' avec actorRef=params.capturedByUserId", () => {
  assert.match(
    coreSrc,
    /role:\s*["']captured_by_user["']/,
    "role 'captured_by_user' doit être câblé",
  )
  assert.match(
    coreSrc,
    /actorRef:\s*params\.capturedByUserId/,
    "actorRef du rôle captured_by_user doit être params.capturedByUserId",
  )
})

test("captureStaffLeadCore passe authorized=true aux deux recordLeadOriginEventCore", () => {
  const authorizedMatches = [...coreSrc.matchAll(/authorized:\s*true/g)]
  assert.ok(
    authorizedMatches.length >= 2,
    `authorized:true doit apparaître au moins 2 fois (un par rôle), trouvé: ${authorizedMatches.length}`,
  )
})

test("captureStaffLeadCore n'est pas un fichier 'use server'", () => {
  assert.doesNotMatch(
    coreSrc,
    /^["']use server["']/m,
    "staff-lead-capture-core.ts ne doit pas être 'use server'",
  )
})
