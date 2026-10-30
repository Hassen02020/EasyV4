/**
 * ANALYTICS-TIMESERIES-FIX-01 — preuve live (PostgreSQL réel) que
 * getTimeSeriesCore s'exécute et ventile correctement current / prev.
 *
 * Avant le correctif, chaque appel échouait en base (42803 « must appear in
 * the GROUP BY clause ») : la date de période était envoyée comme deux
 * paramètres distincts (SELECT et GROUP BY). Les tests unitaires existants,
 * sur une transaction simulée, ne pouvaient pas le voir. Cette fonction
 * alimente Campaign Engine, Actions, Radar, Signaux et Tendances.
 */
import { cleanupAsSuperuserWithDrizzle } from "@/lib/db/test-helpers/superuser-cleanup"
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { withTenantContext, withSystemContext } from "@/lib/db/tenant-context"
import { agencies, leads } from "@/lib/db/schema"
import { getTimeSeriesCore } from "../time-series-core"

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
let agencyId = ""
const DAY = 24 * 60 * 60 * 1000

before(async () => {
  dbAvailable = await isDbAvailable()
  if (!dbAvailable) return
  agencyId = randomUUID()
  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values({
      id: agencyId,
      name: "ANALYTICS-TIMESERIES-FIX-01 agence test",
      agencyType: "ota",
      slug: `timeseries-${agencyId.slice(0, 8)}`,
    })
    const base = {
      agencyId,
      firstName: "Test",
      email: "ts@example.com",
      sourcePage: "/test",
      channel: "website",
    }
    // Fenêtre de 4 semaines : 2 prospects omra récents, 1 omra et 1 hôtel
    // dans la période précédente, 1 hors fenêtre (ignoré).
    await tx.insert(leads).values([
      {
        ...base,
        productType: "omra",
        destination: "Makkah",
        createdAt: new Date(Date.now() - 2 * DAY),
      },
      {
        ...base,
        productType: "omra",
        destination: "Makkah",
        createdAt: new Date(Date.now() - 10 * DAY),
      },
      {
        ...base,
        productType: "omra",
        createdAt: new Date(Date.now() - 35 * DAY),
      },
      {
        ...base,
        productType: "hotel",
        createdAt: new Date(Date.now() - 40 * DAY),
      },
      {
        ...base,
        productType: "hotel",
        createdAt: new Date(Date.now() - 90 * DAY),
      },
    ])
  })
})

after(async () => {
  if (!dbAvailable) return
  await cleanupAsSuperuserWithDrizzle(async (tx) => {
    await tx.delete(leads).where(eq(leads.agencyId, agencyId))
    await tx.delete(agencies).where(eq(agencies.id, agencyId))
  })
})

test("getTimeSeriesCore s'exécute en base et ventile current / prev par dimension", async (t) => {
  if (!dbAvailable)
    return void t.skip("Postgres local indisponible (DATABASE_URL)")
  const rows = await withTenantContext(
    { agencyId, userId: "", isSuperAdmin: false },
    (tx) => getTimeSeriesCore(tx, { agencyId, windowWeeks: 4 }),
  )
  const find = (type: string, dim: string) =>
    rows.find((r) => r.dimensionType === type && r.dimension === dim)

  const omra = find("productType", "omra")
  assert.ok(omra, "ligne omra présente")
  assert.equal(omra.currentLeads, 2)
  assert.equal(omra.prevLeads, 1)

  const hotel = find("productType", "hotel")
  assert.ok(hotel, "ligne hôtel présente")
  assert.equal(hotel.currentLeads, 0)
  assert.equal(hotel.prevLeads, 1)

  const website = find("channel", "website")
  assert.equal(website?.currentLeads, 2)
  assert.equal(website?.prevLeads, 2)

  const makkah = find("destination", "Makkah")
  assert.equal(makkah?.currentLeads, 2)
  assert.equal(makkah?.prevLeads, 0)

  // Aucune réservation pour cette agence : aucune ligne de module.
  assert.equal(rows.filter((r) => r.dimensionType === "module").length, 0)
})
