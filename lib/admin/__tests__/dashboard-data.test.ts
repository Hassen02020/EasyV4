/**
 * Tests unitaires `loadDashboardData`.
 *
 *   pnpm test
 *
 * Le chemin "DB indisponible" doit toujours renvoyer un payload neutre
 * et `available: false` — c'est ce qui empêche le dashboard de crasher
 * pendant les premières secondes après un déploiement.
 */

import test from "node:test"
import assert from "node:assert/strict"

const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL

async function importFresh() {
  // node:test n'a pas de module reset natif ; on bypasse en supprimant
  // l'entrée du require cache pour ré-évaluer le module.
  const path = "../dashboard-data.ts"
  return import(`${path}?t=${Date.now()}`)
}

test("loadDashboardData renvoie EMPTY si DATABASE_URL absent", async () => {
  delete process.env.DATABASE_URL
  try {
    const mod = await importFresh()
    const data = await mod.loadDashboardData(
      "00000000-0000-0000-0000-000000000001",
    )
    assert.equal(data.available, false)
    assert.equal(data.stats.monthlyRevenueTnd, 0)
    assert.equal(data.stats.reservationsToday, 0)
    assert.equal(data.stats.apiErrors24h, 0)
    assert.equal(data.stats.activeCustomers, 0)
    assert.deepEqual(data.recentBookings, [])
    assert.deepEqual(data.byModule, [])
    assert.deepEqual(data.apiErrors, [])
  } finally {
    if (ORIGINAL_DATABASE_URL) {
      process.env.DATABASE_URL = ORIGINAL_DATABASE_URL
    }
  }
})

test("EMPTY shape matches DashboardData typing (no surprise fields)", async () => {
  delete process.env.DATABASE_URL
  try {
    const mod = await importFresh()
    const data = await mod.loadDashboardData(
      "00000000-0000-0000-0000-000000000001",
    )
    const keys = Object.keys(data).sort()
    assert.deepEqual(keys, [
      "apiErrors",
      "available",
      "byModule",
      "recentBookings",
      "stats",
    ])
  } finally {
    if (ORIGINAL_DATABASE_URL) {
      process.env.DATABASE_URL = ORIGINAL_DATABASE_URL
    }
  }
})
