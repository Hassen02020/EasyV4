/**
 * Invariants statiques — NICHE-SIGNAL-01.
 *
 * Avant ce chantier, `getNicheSegmentsCore()` (lib/crm/niche-core.ts)
 * n'avait AUCUN appelant dans app/ ou components/ — le moteur NICHE
 * calculait des segments que rien ne consultait. Vérifie sur le code
 * source réel (readFileSync) que :
 *  1. `lib/admin/niche-actions.ts` réutilise EXACTEMENT le pattern
 *     `assertSupportStaff()` déjà établi par `lib/admin/leads-actions.ts`
 *     (mêmes 3 rôles, même vérification agencyType='ota') — pas un
 *     contrôle d'accès inventé.
 *  2. `listNicheSegments()` appelle bien `assertSupportStaff()` avant
 *     toute lecture DB, et délègue à `getNicheSegmentsCore()` sans
 *     dupliquer sa logique de calcul.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { execSync } from "node:child_process"

const ROOT = process.cwd()
const nicheActionsSrc = readFileSync(
  join(ROOT, "lib/admin/niche-actions.ts"),
  "utf8",
)
const leadsActionsSrc = readFileSync(
  join(ROOT, "lib/admin/leads-actions.ts"),
  "utf8",
)

test("niche-actions.ts : réutilise exactement SUPPORT_STAFF_ROLES de leads-actions.ts", () => {
  const extractRoles = (src: string) => {
    const match = src.match(/SUPPORT_STAFF_ROLES = \[([^\]]+)\]/)
    assert.ok(match, "SUPPORT_STAFF_ROLES doit être défini")
    return match![1]!.replace(/\s/g, "")
  }
  assert.equal(extractRoles(nicheActionsSrc), extractRoles(leadsActionsSrc))
})

test("niche-actions.ts : assertSupportStaff() vérifie agencyType === 'ota', comme leads-actions.ts", () => {
  assert.match(nicheActionsSrc, /profile\.agencyType !== "ota"/)
  assert.match(leadsActionsSrc, /profile\.agencyType !== "ota"/)
})

test("listNicheSegments() : appelle assertSupportStaff() avant toute lecture DB", () => {
  const fnStart = nicheActionsSrc.indexOf(
    "export async function listNicheSegments",
  )
  assert.notEqual(fnStart, -1)
  const fnBody = nicheActionsSrc.slice(fnStart, fnStart + 600)
  const authIdx = fnBody.indexOf("assertSupportStaff()")
  const dbIdx = fnBody.indexOf("withTenantContext")
  assert.ok(authIdx !== -1 && dbIdx !== -1)
  assert.ok(authIdx < dbIdx, "l'autorisation doit précéder l'accès DB")
})

test("listNicheSegments() : délègue à getNicheSegmentsCore sans dupliquer le calcul (pas de .select() direct)", () => {
  assert.match(nicheActionsSrc, /getNicheSegmentsCore\(/)
  assert.equal(nicheActionsSrc.includes(".select("), false)
})

test("listNicheAudience() : appelle assertSupportStaff() avant toute lecture DB (NICHE-AUDIENCE-01)", () => {
  const fnStart = nicheActionsSrc.indexOf(
    "export async function listNicheAudience",
  )
  assert.notEqual(fnStart, -1)
  const fnBody = nicheActionsSrc.slice(fnStart, fnStart + 800)
  const authIdx = fnBody.indexOf("assertSupportStaff()")
  const dbIdx = fnBody.indexOf("withTenantContext")
  assert.ok(authIdx !== -1 && dbIdx !== -1)
  assert.ok(authIdx < dbIdx, "l'autorisation doit précéder l'accès DB")
})

test("listNicheAudience() : le paramètre filter n'accepte jamais agencyId — Omit<NicheAudienceFilter, 'agencyId'> en signature", () => {
  assert.match(
    nicheActionsSrc,
    /listNicheAudience\(\s*filter: Omit<NicheAudienceFilter, "agencyId">/,
  )
})

test("listNicheAudience() : agencyId injecté depuis ctx (résolu serveur), jamais depuis le filtre appelant", () => {
  const fnStart = nicheActionsSrc.indexOf(
    "export async function listNicheAudience",
  )
  const fnBody = nicheActionsSrc.slice(fnStart, fnStart + 1200)
  assert.match(
    fnBody,
    /getNicheAudienceCore\(tx,\s*\{\s*\.\.\.filter,\s*agencyId:\s*ctx\.agencyId\s*\}/,
  )
})

test("getNicheAudienceCore (niche-core.ts) : WHERE inclut toujours eq(leads.agencyId, ...) — jamais une audience cross-tenant", () => {
  const nicheCoreSrc = readFileSync(join(ROOT, "lib/crm/niche-core.ts"), "utf8")
  const fnStart = nicheCoreSrc.indexOf(
    "export async function getNicheAudienceCore",
  )
  assert.notEqual(fnStart, -1)
  const fnBody = nicheCoreSrc.slice(fnStart, fnStart + 1200)
  assert.match(fnBody, /eq\(leads\.agencyId, filter\.agencyId\)/)
})

test("niche-actions.ts reste le SEUL point d'exposition : aucune route app/api ne référence getNicheAudienceCore/listNicheAudience (pas de GET public)", () => {
  const grep = execSync(
    `grep -rl "getNicheAudienceCore\\|listNicheAudience" app lib --include="*.ts" --include="*.tsx" || true`,
    { cwd: ROOT, encoding: "utf8" },
  )
  const files = grep
    .split("\n")
    .filter(Boolean)
    .filter(
      (f) =>
        !f.includes("__tests__") &&
        f !== "lib/crm/niche-core.ts" &&
        f !== "lib/admin/niche-actions.ts",
    )
  assert.deepEqual(files, [])
})
