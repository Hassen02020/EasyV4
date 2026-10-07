/**
 * BEHAVIORAL-SIGNAL-01 — preuve live contre un Postgres réel que
 * `recordHotelSearchDemandCore` incrémente un COMPTEUR agrégé
 * (agencyId, "hotel", destination, jour), jamais une ligne par recherche
 * — et jamais de tracking individuel (aucun champ identité dans la table).
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import { agencies, searchDemandSignals } from "@/lib/db/schema"
import {
  recordHotelSearchDemandCore,
  SEARCH_DEMAND_PILOT_PRODUCT_TYPE,
} from "../search-demand-core"

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

before(async () => {
  dbAvailable = await isDbAvailable()
  if (!dbAvailable) return
  agencyId = randomUUID()
  await withSystemContext((tx) =>
    tx.insert(agencies).values({
      id: agencyId,
      name: "BEHAVIORAL-SIGNAL-01 Agency",
      agencyType: "ota",
      slug: `behavioral-signal-01-${agencyId.slice(0, 8)}`,
    }),
  )
})

after(async () => {
  if (!dbAvailable) return
  // search_demand_signals révoque DELETE pour app_runtime (même discipline
  // que lead_consent_events/contacts — voir drizzle/manual/0122) : on ne
  // supprime jamais directement dedans. ON DELETE CASCADE sur agency_id
  // nettoie les lignes de test quand l'agence elle-même est supprimée.
  await withSystemContext(async (tx) => {
    await tx.delete(agencies).where(eq(agencies.id, agencyId))
  })
})

test("recordHotelSearchDemandCore : 3 recherches même jour/destination => 1 ligne, compteur à 3 (jamais une ligne par recherche)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const now = new Date("2026-10-07T10:00:00Z")

  await withSystemContext((tx) =>
    recordHotelSearchDemandCore(tx, { agencyId, destination: "istanbul", now }),
  )
  await withSystemContext((tx) =>
    recordHotelSearchDemandCore(tx, { agencyId, destination: "istanbul", now }),
  )
  await withSystemContext((tx) =>
    recordHotelSearchDemandCore(tx, { agencyId, destination: "istanbul", now }),
  )

  const rows = await withSystemContext((tx) =>
    tx
      .select()
      .from(searchDemandSignals)
      .where(eq(searchDemandSignals.agencyId, agencyId)),
  )

  assert.equal(
    rows.length,
    1,
    "jamais une ligne par recherche — un seul compteur agrégé",
  )
  assert.equal(rows[0]!.searchCount, 3)
  assert.equal(rows[0]!.productType, SEARCH_DEMAND_PILOT_PRODUCT_TYPE)
  assert.equal(rows[0]!.destination, "istanbul")
  assert.equal(String(rows[0]!.searchDate), "2026-10-07")
})

test("recordHotelSearchDemandCore : jours différents => compteurs séparés", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())

  await withSystemContext((tx) =>
    recordHotelSearchDemandCore(tx, {
      agencyId,
      destination: "antalya",
      now: new Date("2026-11-01T08:00:00Z"),
    }),
  )
  await withSystemContext((tx) =>
    recordHotelSearchDemandCore(tx, {
      agencyId,
      destination: "antalya",
      now: new Date("2026-11-02T08:00:00Z"),
    }),
  )

  const rows = await withSystemContext((tx) =>
    tx
      .select()
      .from(searchDemandSignals)
      .where(eq(searchDemandSignals.destination, "antalya")),
  )

  assert.equal(
    rows.length,
    2,
    "jours différents => compteurs séparés, jamais fusionnés",
  )
  for (const r of rows) {
    assert.equal(r.searchCount, 1)
  }
})

test("recordHotelSearchDemandCore : destinations différentes même jour => compteurs séparés", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const now = new Date("2026-12-01T08:00:00Z")

  await withSystemContext((tx) =>
    recordHotelSearchDemandCore(tx, { agencyId, destination: "tunis", now }),
  )
  await withSystemContext((tx) =>
    recordHotelSearchDemandCore(tx, { agencyId, destination: "djerba", now }),
  )

  const rows = await withSystemContext((tx) =>
    tx
      .select()
      .from(searchDemandSignals)
      .where(eq(searchDemandSignals.searchDate, "2026-12-01")),
  )

  const destinations = rows.map((r) => r.destination).sort()
  assert.deepEqual(destinations, ["djerba", "tunis"])
})

test("recordHotelSearchDemandCore : isolation stricte par agence", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const otherAgencyId = randomUUID()
  await withSystemContext((tx) =>
    tx.insert(agencies).values({
      id: otherAgencyId,
      name: "Autre agence",
      agencyType: "ota",
      slug: `other-agency-${otherAgencyId.slice(0, 8)}`,
    }),
  )
  try {
    const now = new Date("2026-10-15T08:00:00Z")
    await withSystemContext((tx) =>
      recordHotelSearchDemandCore(tx, {
        agencyId: otherAgencyId,
        destination: "le-caire",
        now,
      }),
    )

    const rows = await withSystemContext((tx) =>
      tx
        .select()
        .from(searchDemandSignals)
        .where(eq(searchDemandSignals.agencyId, agencyId)),
    )
    assert.ok(
      !rows.some((r) => r.destination === "le-caire"),
      "jamais de fuite cross-agence",
    )
  } finally {
    // search_demand_signals révoque DELETE pour app_runtime — ON DELETE
    // CASCADE sur agency_id nettoie la ligne quand l'agence est supprimée.
    await withSystemContext(async (tx) => {
      await tx.delete(agencies).where(eq(agencies.id, otherAgencyId))
    })
  }
})
