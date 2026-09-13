/**
 * PHASE PREMIUM 2 — Chantier 3 (Destination Search / Autocomplete unifié).
 *
 * Teste GET /api/destinations/search contre le seed réel posé par
 * drizzle/manual/0055_destinations_seed.sql (pas des fixtures inventées —
 * les mêmes valeurs que les tableaux statiques historiques). Comme les
 * autres suites DB-mode de cette session, se dégrade proprement (tous les
 * tests `skip`) si aucune base n'est joignable.
 */
import test, { before } from "node:test"
import assert from "node:assert/strict"
import { NextRequest } from "next/server"
import { eq, and, sql } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import { destinationExternalRefs } from "@/lib/db/schema"
import { GET } from "@/app/api/destinations/search/route"

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
const skipReason = () =>
  "Postgres local indisponible (DATABASE_URL) — appliquer drizzle/manual/0055_destinations_seed.sql sur un mirroir local pour exécuter ces tests."

before(async () => {
  dbAvailable = await isDbAvailable()
})

function callSearch(module: string | null) {
  const url = module
    ? `http://localhost/api/destinations/search?module=${encodeURIComponent(module)}`
    : "http://localhost/api/destinations/search"
  return GET(new NextRequest(url))
}

interface DestinationRow {
  externalId: string
  name: string
  nameEn: string | null
  nameAr: string | null
  countryName: string | null
  countryNameEn: string | null
  countryNameAr: string | null
}

test("1. module absent -> 400 invalid_module", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const res = await callSearch(null)
  assert.equal(res.status, 400)
  const body = await res.json()
  assert.equal(body.error, "invalid_module")
})

test("2. module non reconnu (mygo_city, hors périmètre de ce chantier) -> 400", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const res = await callSearch("mygo_city")
  assert.equal(res.status, 400)
})

test("3. module=hotels_monde_slug renvoie les 10 destinations du seed, avec pays", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const res = await callSearch("hotels_monde_slug")
  assert.equal(res.status, 200)
  const body = (await res.json()) as { destinations: DestinationRow[] }
  assert.equal(body.destinations.length, 10)
  const istanbul = body.destinations.find((d) => d.externalId === "istanbul")
  assert.ok(istanbul)
  assert.equal(istanbul!.name, "Istanbul")
  assert.equal(istanbul!.countryName, "Turquie")
  assert.equal(istanbul!.countryNameEn, "Turkey")
  assert.equal(istanbul!.countryNameAr, "تركيا")
})

test("4. module=packages_slug renvoie les 8 destinations du seed", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const res = await callSearch("packages_slug")
  assert.equal(res.status, 200)
  const body = (await res.json()) as { destinations: DestinationRow[] }
  assert.equal(body.destinations.length, 8)
  assert.ok(body.destinations.some((d) => d.externalId === "casablanca"))
})

test("5. module=iata renvoie les 11 codes du seed — deux codes (CDG/ORY) pointent vers la même ville (Paris)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const res = await callSearch("iata")
  assert.equal(res.status, 200)
  const body = (await res.json()) as { destinations: DestinationRow[] }
  assert.equal(body.destinations.length, 11)
  const cdg = body.destinations.find((d) => d.externalId === "CDG")
  const ory = body.destinations.find((d) => d.externalId === "ORY")
  assert.ok(cdg && ory)
  assert.equal(cdg!.name, "Paris")
  assert.equal(ory!.name, "Paris")
  assert.equal(cdg!.countryName, "France")
})

test("6. external_id renvoyé, jamais l'UUID interne — external_id reste un slug/code, pas un UUID", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const res = await callSearch("iata")
  const body = (await res.json()) as { destinations: DestinationRow[] }
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  for (const d of body.destinations) {
    assert.ok(!uuidRe.test(d.externalId), `externalId '${d.externalId}' ne doit pas être un UUID`)
  }
})

test("7. une correspondance désactivée (is_active=false) disparaît de la liste, puis réapparaît une fois réactivée", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  await withSystemContext((tx) =>
    tx
      .update(destinationExternalRefs)
      .set({ isActive: false })
      .where(and(eq(destinationExternalRefs.module, "packages_slug"), eq(destinationExternalRefs.externalId, "casablanca"))),
  )
  try {
    const res = await callSearch("packages_slug")
    const body = (await res.json()) as { destinations: DestinationRow[] }
    assert.equal(body.destinations.length, 7)
    assert.ok(!body.destinations.some((d) => d.externalId === "casablanca"))
  } finally {
    await withSystemContext((tx) =>
      tx
        .update(destinationExternalRefs)
        .set({ isActive: true })
        .where(and(eq(destinationExternalRefs.module, "packages_slug"), eq(destinationExternalRefs.externalId, "casablanca"))),
    )
  }
})

