/**
 * GUEST-IDEMPOTENCY-01 — course ENTRE instances (processus distincts, donc
 * sans la coalescence en mémoire d'une instance) : seul l'index unique
 * partiel `reservations_guest_idempotency_uniq` départage. Preuve réelle,
 * PostgreSQL, rôle app_runtime ; skip sans DATABASE_URL.
 */
import test, { before } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { spawn } from "node:child_process"
import { sql } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import {
  agencies,
  catalogTransferPricing,
  catalogTransferZones,
} from "@/lib/db/schema"
import { issueAttemptToken } from "@/lib/booking/attempt-token"

let dbAvailable = false
before(async () => {
  try {
    await withSystemContext((tx) => tx.execute(sql`select 1`))
    dbAvailable = true
  } catch {
    dbAvailable = false
  }
})

function runChild(cfg: unknown): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const p = spawn(
      process.execPath,
      [
        "--experimental-test-module-mocks",
        "--import",
        "tsx",
        "lib/transfers/__tests__/support/attempt-child.ts",
      ],
      {
        env: {
          ...process.env,
          GUEST_ATTEMPT_TOKEN_MODE: "dual",
          ATTEMPT_CHILD: JSON.stringify(cfg),
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    )
    let out = ""
    let err = ""
    p.stdout.on("data", (d) => (out += d))
    p.stderr.on("data", (d) => (err += d))
    p.on("close", () => {
      const line = out.split("\n").find((l) => l.startsWith("RESULT:"))
      if (!line) return reject(new Error(`pas de résultat: ${err.slice(-500)}`))
      resolve(JSON.parse(line.slice(7)))
    })
  })
}

test("même jeton dans 4 instances simultanées (index unique seul) → 1 ligne, 4 réponses cohérentes", async (t) => {
  if (!dbAvailable) return t.skip("Postgres indisponible (DATABASE_URL)")
  const agencyId = randomUUID()
  const fromZoneId = randomUUID()
  const toZoneId = randomUUID()
  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values({
      id: agencyId,
      slug: `idemx-${agencyId.slice(0, 8)}`,
      name: "GUEST-IDEMPOTENCY-01 multi-instance",
      agencyType: "ota",
    })
    await tx.insert(catalogTransferZones).values([
      { id: fromZoneId, agencyId, name: "A", zoneType: "airport" },
      { id: toZoneId, agencyId, name: "B", zoneType: "hotel" },
    ])
    await tx.insert(catalogTransferPricing).values({
      agencyId,
      fromZoneId,
      toZoneId,
      vehicleType: "sedan",
      basePriceTnd: "50.00",
    })
  })
  const phone = "29" + String(Date.now()).slice(-6)
  const input = {
    fromZoneId,
    toZoneId,
    vehicleType: "sedan",
    pickupDate: "2029-05-05",
    pickupTime: "09:00",
    pax: 2,
    customer: {
      firstName: "Multi",
      lastName: "Instance",
      phone,
      email: "multi@example.test",
    },
    attemptToken: issueAttemptToken("transfer", agencyId),
  }
  const results = await Promise.all(
    Array.from({ length: 4 }, () => runChild({ agencyId, input })),
  )
  const rows = await withSystemContext((db) =>
    db.execute(sql`SELECT r.id FROM reservations r
      JOIN customers c ON c.id = r.customer_id
      WHERE r.agency_id = ${agencyId} AND c.phone = ${phone}`),
  )
  assert.equal(rows.length, 1, JSON.stringify(results))
  assert.ok(
    results.every((r) => r.ok === true),
    JSON.stringify(results),
  )
  assert.equal(new Set(results.map((r) => r.reservationId)).size, 1)
  const orphans = await withSystemContext((db) =>
    db.execute(sql`SELECT count(*)::int AS n FROM customers
      WHERE agency_id = ${agencyId} AND phone = ${phone}`),
  )
  // Les transactions perdantes sont annulées : aucun client orphelin.
  assert.equal((orphans[0] as { n: number }).n, 1)
})
