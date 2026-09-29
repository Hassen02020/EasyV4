/**
 * R7-01 (audit Phase 7) : vérifie que `lib/modules/capabilities.ts` reste
 * cohérent avec le code réel — pas seulement une déclaration statique qui
 * peut dériver silencieusement (c'est exactement ce qui s'était produit
 * pour le module Car dans EASYV4_CAR_DECISION.md).
 *
 * Ce test ne rejoue pas les modules (pas de DB) : il vérifie sur le
 * système de fichiers réel que les preuves citées par le registre existent
 * encore et portent toujours le signal attendu.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { MODULE_CAPABILITIES } from "@/lib/modules/capabilities"

const ROOT = process.cwd()

for (const [id, mod] of Object.entries(MODULE_CAPABILITIES)) {
  test(`capabilities registry — ${id} (${mod.status}) : bookingActionFile requis et existant`, () => {
    if (mod.status === "REAL" || mod.status === "DEMO") {
      assert.ok(
        mod.bookingActionFile,
        `${id} est déclaré ${mod.status} mais n'a pas de bookingActionFile — une réservation réelle doit être prouvée par un fichier`,
      )
      const path = join(ROOT, mod.bookingActionFile!)
      assert.ok(
        existsSync(path),
        `${id} : bookingActionFile déclaré (${mod.bookingActionFile}) n'existe plus — le registre a dérivé de la réalité`,
      )
    }
    if (mod.status === "SEARCH_ONLY" || mod.status === "NOT_WIRED") {
      assert.ok(
        !mod.bookingActionFile,
        `${id} est déclaré ${mod.status} mais porte un bookingActionFile (${mod.bookingActionFile}) — incohérent, devrait être REAL ou DEMO`,
      )
    }
  })

  if (mod.status === "DEMO") {
    test(`capabilities registry — ${id} : demoSupplierFile requis et porte bien le signal isDemoMode/"virtual"`, () => {
      assert.ok(
        mod.demoSupplierFile,
        `${id} est déclaré DEMO mais n'a pas de demoSupplierFile — le statut DEMO doit être prouvé par un driver fournisseur simulé`,
      )
      const path = join(ROOT, mod.demoSupplierFile!)
      assert.ok(existsSync(path), `${id} : demoSupplierFile déclaré (${mod.demoSupplierFile}) n'existe plus`)
      const src = readFileSync(path, "utf8")
      assert.match(
        src,
        /isDemoMode/,
        `${id} : ${mod.demoSupplierFile} ne contient plus le signal isDemoMode — statut DEMO à revérifier`,
      )
      assert.match(
        src,
        /name:\s*["']virtual["']/,
        `${id} : ${mod.demoSupplierFile} ne déclare plus de driver "virtual" — statut DEMO à revérifier`,
      )
    })
  }
}

test("capabilities registry — au moins un module par statut attendu (photo actuelle de l'audit R7-01)", () => {
  const statuses = Object.values(MODULE_CAPABILITIES).map((m) => m.status)
  assert.ok(statuses.includes("REAL"), "aucun module REAL trouvé")
  assert.ok(statuses.includes("DEMO"), "aucun module DEMO trouvé")
})
