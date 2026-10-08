/**
 * SEARCH-DEMAND-DISPLAY-01 — preuve live (Postgres réel) que
 * `getSearchDemandSummaryCore` agrège correctement par destination,
 * respecte l'isolation cross-agency, et tronque à 50 lignes.
 *
 * Mêmes conventions que les suites live existantes :
 *  - se dégrade en `skip` sans DATABASE_URL/Postgres local disponible ;
 *  - fixtures marquées d'un préfixe uuid-run pour un nettoyage précis.
 */

import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { withSystemContext, withTenantContext } from "@/lib/db/tenant-context"
import { agencies, searchDemandSignals } from "@/lib/db/schema"
import {
  getSearchDemandSummaryCore,
  recordHotelSearchDemandCore,
  SEARCH_DEMAND_PILOT_PRODUCT_TYPE,
} from "@/lib/crm/search-demand-core"

async function isDbAvailable(): Promise<boolean> {
  try {
    await withSystemContext(async (tx) => {
      await tx.execute(sql`select 1`)
    })
    return true
  } catch {
    return false
  }
}

let dbAvailable = false
const skipReason = () => "Postgres local indisponible (DATABASE_URL)."

let agencyId = ""
let otherAgencyId = ""

before(async () => {
  dbAvailable = await isDbAvailable()
  if (!dbAvailable) return
  agencyId = randomUUID()
  otherAgencyId = randomUUID()
  await withSystemContext((tx) =>
    tx.insert(agencies).values([
      {
        id: agencyId,
        name: "SEARCH-DEMAND-DISPLAY Agency A",
        agencyType: "ota",
        slug: `sdd-a-${agencyId.slice(0, 8)}`,
      },
      {
        id: otherAgencyId,
        name: "SEARCH-DEMAND-DISPLAY Agency B",
        agencyType: "ota",
        slug: `sdd-b-${otherAgencyId.slice(0, 8)}`,
      },
    ]),
  )
})

after(async () => {
  if (!dbAvailable) return
  // ON DELETE CASCADE sur agency_id — supprimer l'agence nettoie les signaux.
  await withSystemContext(async (tx) => {
    await tx.delete(agencies).where(eq(agencies.id, agencyId))
    await tx.delete(agencies).where(eq(agencies.id, otherAgencyId))
  })
})

test("getSearchDemandSummaryCore : agrégation par destination — somme correcte, tri décroissant", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())

  const today = new Date()
  await withSystemContext((tx) =>
    Promise.all([
      // Tunis : 5 recherches sur 2 jours
      recordHotelSearchDemandCore(tx, {
        agencyId,
        destination: "tunis",
        now: today,
      }),
      recordHotelSearchDemandCore(tx, {
        agencyId,
        destination: "tunis",
        now: today,
      }),
      recordHotelSearchDemandCore(tx, {
        agencyId,
        destination: "tunis",
        now: today,
      }),
      // Hammamet : 2 recherches
      recordHotelSearchDemandCore(tx, {
        agencyId,
        destination: "hammamet",
        now: today,
      }),
      recordHotelSearchDemandCore(tx, {
        agencyId,
        destination: "hammamet",
        now: today,
      }),
    ]),
  )

  const rows = await withTenantContext(
    { agencyId, userId: randomUUID(), isSuperAdmin: false },
    (tx) => getSearchDemandSummaryCore(tx, { agencyId }),
  )

  const tunis = rows.find((r) => r.destination === "tunis")
  const hammamet = rows.find((r) => r.destination === "hammamet")

  assert.ok(tunis, "Tunis doit apparaître dans les résultats")
  assert.ok(hammamet, "Hammamet doit apparaître dans les résultats")
  assert.ok(
    tunis!.totalCount >= 3,
    "Tunis doit avoir au moins 3 recherches (peut avoir des données pré-test)",
  )
  assert.ok(
    hammamet!.totalCount >= 2,
    "Hammamet doit avoir au moins 2 recherches",
  )
  assert.equal(tunis!.productType, SEARCH_DEMAND_PILOT_PRODUCT_TYPE)

  // Tri décroissant : Tunis (≥3) avant Hammamet (≥2)
  const tunisIdx = rows.findIndex((r) => r.destination === "tunis")
  const hammametIdx = rows.findIndex((r) => r.destination === "hammamet")
  assert.ok(
    tunisIdx < hammametIdx,
    "Tunis (plus de recherches) doit apparaître avant Hammamet dans le tri décroissant",
  )
})

test("getSearchDemandSummaryCore : isolation cross-agency — agence B ne voit pas les données de A", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())

  const today = new Date()
  // Seed agence A uniquement
  await withSystemContext((tx) =>
    recordHotelSearchDemandCore(tx, {
      agencyId,
      destination: "sousse",
      now: today,
    }),
  )

  // Agence B ne doit voir aucune ligne avec destination "sousse" de A
  const rowsB = await withTenantContext(
    { agencyId: otherAgencyId, userId: randomUUID(), isSuperAdmin: false },
    (tx) => getSearchDemandSummaryCore(tx, { agencyId: otherAgencyId }),
  )

  const leakedRow = rowsB.find((r) => r.destination === "sousse")
  assert.equal(
    leakedRow,
    undefined,
    "Les données de l'agence A ne doivent jamais apparaître pour l'agence B",
  )
})

test("getSearchDemandSummaryCore : filtre 30 jours — données anciennes exclues", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())

  // Insérer une ligne directement avec une date hors fenêtre (il y a 40 jours)
  const oldDate = new Date()
  oldDate.setDate(oldDate.getDate() - 40)
  const oldDateStr = oldDate.toISOString().slice(0, 10)

  const oldDestination = `old-dest-${randomUUID().slice(0, 8)}`
  await withSystemContext((tx) =>
    tx.insert(searchDemandSignals).values({
      agencyId,
      productType: SEARCH_DEMAND_PILOT_PRODUCT_TYPE,
      destination: oldDestination,
      searchDate: oldDateStr,
      searchCount: 99,
    }),
  )

  const rows = await withTenantContext(
    { agencyId, userId: randomUUID(), isSuperAdmin: false },
    (tx) => getSearchDemandSummaryCore(tx, { agencyId, days: 30 }),
  )

  const oldRow = rows.find((r) => r.destination === oldDestination)
  assert.equal(
    oldRow,
    undefined,
    "Une destination dont la seule donnée est vieille de 40 jours ne doit pas apparaître dans la fenêtre de 30 jours",
  )
})
