/**
 * PHASE PREMIUM 2 — Chantier 2 : Canonical Destination Model.
 *
 * Comme lib/hotel-suppliers/tenant/__tests__/resolver-security.test.ts
 * (Phase 27), ces garanties (contraintes SQL + RLS) sont appliquées par
 * PostgreSQL lui-même — les tester avec un mock Drizzle ne prouverait que ma
 * propre compréhension du schéma, pas le comportement réel. Exécuté contre
 * un Postgres réel (mirroir local — drizzle/manual/0054_destinations.sql).
 * Se dégrade proprement (tous les tests `skip`) si aucune base n'est
 * joignable.
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { withTenantContext, withSystemContext, type TenantContext } from "@/lib/db/tenant-context"
import { getDb } from "@/lib/db/client"
import { destinations, destinationExternalRefs } from "@/lib/db/schema"

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
  "Postgres local indisponible (DATABASE_URL) — appliquer drizzle/manual/0054_destinations.sql sur un mirroir local pour exécuter ces tests."

// Préfixe unique par run pour ne jamais collisionner avec un run précédent
// interrompu (aucun cleanup global entre runs de cette suite).
const RUN = randomUUID().slice(0, 8)
const slug = (s: string) => `d54-${RUN}-${s}`
// Code pays factice, jamais "TN"/"FR"/etc. — depuis le chantier 3
// (0055_destinations_seed.sql), ces codes ISO réels occupent déjà
// destinations_country_code_uniq de façon permanente. Aucun des 11 pays
// réels du seed ne commence par "Z".
const FAKE_COUNTRY_CODE = `Z${RUN[0]!.toUpperCase()}`

const nonAdminCtx = (): TenantContext => ({
  agencyId: null,
  userId: randomUUID(),
  isSuperAdmin: false,
})

let countryId = ""
let cityId = ""

async function cleanup() {
  await withSystemContext(async (tx) => {
    await tx.delete(destinations).where(sql`${destinations.slug} like ${`d54-${RUN}-%`}`)
  })
}

before(async () => {
  dbAvailable = await isDbAvailable()
})
after(async () => {
  if (dbAvailable) await cleanup()
})

test("1. destinations_city_has_parent_check rejette une ville sans parent_id", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  await assert.rejects(() =>
    withSystemContext((tx) =>
      tx.insert(destinations).values({ type: "city", slug: slug("orphan-city"), name: "Orphan" }),
    ),
  )
})

test("2. destinations_city_has_parent_check rejette un pays avec parent_id", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const [tn] = await withSystemContext((tx) =>
    tx.insert(destinations).values({ type: "country", slug: slug("tn-tmp2"), name: "Tunisie" }).returning({ id: destinations.id }),
  )
  await assert.rejects(() =>
    withSystemContext((tx) =>
      tx.insert(destinations).values({ type: "country", slug: slug("tn-child"), name: "Tunisie enfant", parentId: tn!.id }),
    ),
  )
})

test("3. Un pays sans parent et une ville avec parent sont acceptés (mise en place des fixtures)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const [country] = await withSystemContext((tx) =>
    tx
      .insert(destinations)
      .values({ type: "country", slug: slug("tunisie"), name: "Tunisie", countryCode: FAKE_COUNTRY_CODE })
      .returning({ id: destinations.id }),
  )
  countryId = country!.id
  const [city] = await withSystemContext((tx) =>
    tx
      .insert(destinations)
      .values({ type: "city", slug: slug("hammamet"), name: "Hammamet", parentId: countryId, region: "Cap Bon" })
      .returning({ id: destinations.id }),
  )
  cityId = city!.id
  assert.ok(countryId && cityId)
})

test("4. destinations_slug_uniq rejette un slug dupliqué", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  await assert.rejects(() =>
    withSystemContext((tx) =>
      tx.insert(destinations).values({ type: "country", slug: slug("tunisie"), name: "Tunisie bis" }),
    ),
  )
})

test("5. destinations_country_code_uniq rejette un country_code dupliqué (type=country)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  await assert.rejects(() =>
    withSystemContext((tx) =>
      tx.insert(destinations).values({ type: "country", slug: slug("tunisie2"), name: "Tunisie 2", countryCode: FAKE_COUNTRY_CODE }),
    ),
  )
})

test("6. destination_external_refs_module_external_uniq rejette une correspondance (module, external_id) dupliquée", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  await withSystemContext((tx) =>
    tx.insert(destinationExternalRefs).values({ destinationId: cityId, module: "mygo_city", externalId: "10" }),
  )
  await assert.rejects(() =>
    withSystemContext((tx) =>
      tx.insert(destinationExternalRefs).values({ destinationId: countryId, module: "mygo_city", externalId: "10" }),
    ),
  )
})

test("7. destination_external_refs_module_check rejette un module hors liste fermée", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  await assert.rejects(() =>
    withSystemContext((tx) =>
      tx.insert(destinationExternalRefs).values({ destinationId: cityId, module: "bogus_module", externalId: "99" }),
    ),
  )
})

test("8. Supprimer une destination supprime en cascade ses external_refs", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const [tmp] = await withSystemContext((tx) =>
    tx
      .insert(destinations)
      .values({ type: "city", slug: slug("cascade-city"), name: "Cascade City", parentId: countryId })
      .returning({ id: destinations.id }),
  )
  await withSystemContext((tx) =>
    tx.insert(destinationExternalRefs).values({ destinationId: tmp!.id, module: "iata", externalId: "CSC" }),
  )
  await withSystemContext((tx) => tx.delete(destinations).where(eq(destinations.id, tmp!.id)))
  const remaining = await withSystemContext((tx) =>
    tx.select().from(destinationExternalRefs).where(eq(destinationExternalRefs.destinationId, tmp!.id)),
  )
  assert.equal(remaining.length, 0)
})

test("9. RLS — withSystemContext() (super_admin, catalogue public) peut lire les destinations", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const rows = await withSystemContext((tx) =>
    tx.select().from(destinations).where(eq(destinations.id, cityId)),
  )
  assert.equal(rows.length, 1)
})

test("10. RLS — une session authentifiée non super_admin peut lire les destinations", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const rows = await withTenantContext(nonAdminCtx(), (tx) =>
    tx.select().from(destinations).where(eq(destinations.id, cityId)),
  )
  assert.equal(rows.length, 1)
})

test("11. RLS — une session authentifiée non super_admin ne peut jamais écrire (insert bloqué)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  await assert.rejects(() =>
    withTenantContext(nonAdminCtx(), (tx) =>
      tx.insert(destinations).values({ type: "country", slug: slug("forbidden"), name: "Forbidden" }),
    ),
  )
})

test("12. RLS — une session totalement anonyme (aucun GUC positionné, ni current_user_id ni is_super_admin) ne lit aucune ligne", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  // Transaction brute via getDb() — ni withTenantContext() ni
  // withSystemContext(), donc aucun `app.*` GUC positionné, comme une vraie
  // connexion jamais authentifiée.
  const rows = await getDb().transaction(async (tx) =>
    tx.select().from(destinations).where(eq(destinations.id, cityId)),
  )
  assert.equal(rows.length, 0)
})
