/**
 * NETWORK-01 — invariants statiques sur `lib/suppliers/portal-actions.ts`.
 *
 * Le fichier porte `"use server"` et importe `revalidatePath` (next/cache),
 * comme `lib/booking/actions.ts`/`lib/admin/users-actions.ts` — il ne peut
 * donc pas être chargé par `node --test` hors du bundler Next.js (même
 * contrainte documentée dans tenant-continuity-invariants.test.ts).
 * Vérification statique sur le code source réel, même méthode.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const src = readFileSync(
  join(process.cwd(), "lib/suppliers/portal-actions.ts"),
  "utf8",
)

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

test("createSupplierNodeAction : gated super_admin (requireSuperAdmin) avant toute écriture", () => {
  const fnIdx = src.indexOf("export async function createSupplierNodeAction")
  const authIdx = src.indexOf("await requireSuperAdmin()", fnIdx)
  const insertIdx = src.indexOf(".insert(supplierNodes)", fnIdx)
  assert.ok(
    fnIdx > 0 && authIdx > fnIdx && insertIdx > authIdx,
    "l'auth doit précéder l'insert",
  )
})

test("inviteSupplierPortalUser : gated super_admin (requireSuperAdmin) avant l'invitation Supabase", () => {
  const fnIdx = src.indexOf("export async function inviteSupplierPortalUser")
  const authIdx = src.indexOf("await requireSuperAdmin()", fnIdx)
  const inviteIdx = src.indexOf("admin.auth.admin.inviteUserByEmail", fnIdx)
  assert.ok(
    fnIdx > 0 && authIdx > fnIdx && authIdx < inviteIdx,
    "l'auth doit précéder l'invitation",
  )
})

test("inviteSupplierPortalUser : invitation Supabase Auth réelle (jamais un token custom différé) — userId réel obtenu immédiatement, jamais un invitationToken écrit", () => {
  assert.match(src, /const newUserId = invited\.data\.user\.id/)
  assert.equal(countOccurrences(src, "invitationToken:"), 0)
})

test("inviteSupplierPortalUser : rollback du compte Auth orphelin si l'insert profil échoue (même garde que createPartnerAgent/createStaffUser)", () => {
  const fnIdx = src.indexOf("export async function inviteSupplierPortalUser")
  const nextFnIdx = src.indexOf("\nexport async function", fnIdx + 1)
  const fnBody = src.slice(fnIdx, nextFnIdx > 0 ? nextFnIdx : undefined)
  assert.match(
    fnBody,
    /admin\.auth\.admin\.deleteUser\(newUserId\)\.catch\(\(\) => \{\}\)/,
  )
})

test("createSupplierNodeAction : vérifie qu'aucun nœud n'existe déjà pour ce supplierId AVANT l'insert (contrainte d'unicité applicative, pas seulement DB)", () => {
  const fnIdx = src.indexOf("export async function createSupplierNodeAction")
  const checkIdx = src.indexOf("Ce fournisseur a déjà un nœud réseau", fnIdx)
  const insertIdx = src.indexOf(".insert(supplierNodes)", fnIdx)
  assert.ok(
    checkIdx > fnIdx && checkIdx < insertIdx,
    "la vérification d'unicité doit précéder l'insert",
  )
})

test("créations tracées via supplierLogs (jamais auditEvents — FK agency_id NOT NULL incompatible avec des entités plateforme sans agence)", () => {
  assert.equal(countOccurrences(src, "auditEvents"), 0)
  assert.ok(countOccurrences(src, ".insert(supplierLogs)") >= 3)
})

test("NETWORK-HARDEN-01 : createSupplierNode/updateSupplierNodeStatus bruts (sans gate RBAC) supprimés — plus aucun export non gardé", () => {
  assert.equal(countOccurrences(src, "export async function createSupplierNode("), 0)
  assert.equal(countOccurrences(src, "export async function updateSupplierNodeStatus("), 0)
})

test("updateSupplierNodeStatusAction : gated super_admin (requireSuperAdmin) avant toute écriture", () => {
  const fnIdx = src.indexOf("export async function updateSupplierNodeStatusAction")
  const authIdx = src.indexOf("await requireSuperAdmin()", fnIdx)
  const updateIdx = src.indexOf(".update(supplierNodes)", fnIdx)
  assert.ok(
    fnIdx > 0 && authIdx > fnIdx && updateIdx > authIdx,
    "l'auth doit précéder l'update",
  )
})
