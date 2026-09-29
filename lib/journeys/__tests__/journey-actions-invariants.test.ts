/**
 * JOURNEY-BUILDER-01 — invariants statiques sur
 * `lib/journeys/journey-actions.ts`.
 *
 * Le fichier porte `"use server"` — ne peut pas être chargé par
 * `node --test` hors bundler Next.js (même contrainte documentée dans
 * tenant-continuity-invariants.test.ts). Vérification statique sur le code
 * source réel.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const src = readFileSync(join(process.cwd(), "lib/journeys/journey-actions.ts"), "utf8")

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

test("resolveActorContext : un agencyId fourni par un utilisateur agence normal (non super_admin) est ignoré — jamais fait confiance au client", () => {
  const fnIdx = src.indexOf("async function resolveActorContext")
  const fnSrc = src.slice(fnIdx, src.indexOf("\n}", fnIdx))
  assert.match(fnSrc, /if \(!session\.agencyId\)/)
  assert.match(fnSrc, /agencyId: session\.agencyId/)
  // Le paramètre explicite n'est utilisé QUE dans la branche isSuperAdmin.
  const superAdminBranch = fnSrc.slice(fnSrc.indexOf("if (session.isSuperAdmin)"), fnSrc.indexOf("if (!session.agencyId)"))
  assert.match(superAdminBranch, /explicitAgencyId/)
})

test("confirmJourneyLine : 3 transactions SÉPARÉES (CAS, dispatch hors transaction, enregistrement) — jamais le moteur réel appelé À L'INTÉRIEUR d'un withTenantContext", () => {
  const fnIdx = src.indexOf("export async function confirmJourneyLine")
  const fnSrc = src.slice(fnIdx, src.indexOf("\n}\n", fnIdx))
  // Exactement 2 appels withTenantContext dans toute la fonction : un pour le
  // CAS (étape 1), un pour l'enregistrement du résultat (étape 3) — jamais un
  // seul withTenantContext englobant les 3 étapes (ce qui imbriquerait la
  // transaction du moteur réel dans la nôtre, voir la doc de tête du fichier).
  assert.equal(countOccurrences(fnSrc, "withTenantContext("), 2)

  const firstWtcIdx = fnSrc.indexOf("withTenantContext(")
  const secondWtcIdx = fnSrc.indexOf("withTenantContext(", firstWtcIdx + 1)
  const dispatchIdx = fnSrc.indexOf("dispatchJourneyLine(")
  assert.ok(
    firstWtcIdx < dispatchIdx && dispatchIdx < secondWtcIdx,
    "ordre attendu : 1er withTenantContext (CAS) -> dispatchJourneyLine (hors transaction) -> 2e withTenantContext (enregistrement)",
  )
})

test("dispatchJourneyLine : couvre exactement les 7 modules câblés en V1 (hotel/package/omra/activity/transfer/car/network) — jamais vols/hotel_monde (async/guest-only, hors périmètre documenté)", () => {
  const fnIdx = src.indexOf("async function dispatchJourneyLine")
  const fnSrc = src.slice(fnIdx, src.indexOf("\n}\n", fnIdx))
  for (const m of ["hotel", "package", "omra", "activity", "transfer", "car", "network"]) {
    assert.match(fnSrc, new RegExp(`case "${m}":`))
  }
  assert.equal(fnSrc.includes('case "vols"'), false)
  assert.equal(fnSrc.includes('case "hotel_monde"'), false)
})

test("dispatchJourneyLine : appelle chaque moteur réel importé tel quel, jamais une réimplémentation locale", () => {
  for (const fn of [
    "createReservationFromDraft",
    "createPackageBooking",
    "createOmraBooking",
    "createActivityBooking",
    "createTransferBooking",
    "createCarBooking",
    "createNetworkProductBooking",
  ]) {
    assert.match(src, new RegExp(`import \\{ ${fn} \\}`))
    assert.match(src, new RegExp(`await ${fn}\\(`))
  }
})

test("createJourney/listMyJourneys : passent par resolveActorContext (agencyId explicite requis pour le staff) — addJourneyLine/removeJourneyLine/confirmJourneyLine/getJourney : passent par resolveActorForExistingRecord (l'agence est déjà fixée par l'enregistrement ciblé, jamais un agencyId brut du client)", () => {
  assert.equal(countOccurrences(src, "await resolveActorContext("), 2)
  assert.equal(countOccurrences(src, "await resolveActorForExistingRecord("), 4)
})

test("aucun nouveau moteur financier créé — pas de debitPartnerCredit ni de calcul de prix/marge dans ce fichier (délégué entièrement aux moteurs réels)", () => {
  assert.equal(countOccurrences(src, "debitPartnerCredit"), 0)
  assert.equal(countOccurrences(src, "applyMargin("), 0)
  assert.equal(countOccurrences(src, "getMarginsForAgency("), 0)
})
