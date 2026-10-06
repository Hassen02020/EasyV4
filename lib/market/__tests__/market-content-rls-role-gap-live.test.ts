/**
 * MARKET-CONTENT-RLS-ROLE-GAP-01 — preuve live contre un Postgres réel,
 * même convention que lib/public/__tests__/public-visual-rls-role-gap-live.test.ts
 * et lib/db/__tests__/rls-gap-public-tables-01-live.test.ts.
 *
 * Régression : les policies de market_signals/development_projects
 * (migration 0094) étaient scopées TO authenticated — un rôle dont
 * app_runtime (le rôle Postgres réel de DATABASE_URL) n'est jamais membre.
 * Avec FORCE ROW LEVEL SECURITY : lecture → 0 ligne silencieuse ; écriture
 * super_admin (lib/market/admin-actions.ts) → erreur RLS explicite.
 *
 * drizzle/manual/0121_market_content_rls_role_gap.sql recrée les 4
 * policies sans restriction de rôle. is_super_admin() reste la garde DB
 * pour l'écriture (décision explicite, voir docs/ROADMAP.md) — ce qui
 * exige que l'appelant positionne le GUC app.is_super_admin, d'où le
 * wiring withSystemContext() ajouté dans admin-actions.ts dans le même
 * chantier.
 *
 * Ce test prouve, contre le DATABASE_URL réel (jamais une connexion
 * superuser/bypass RLS) :
 *   - lecture : app_runtime lit les lignes sans aucun contexte particulier
 *     (policy *_read, USING(true), pas de rôle requis) ;
 *   - écriture avec le GUC posé (withSystemContext — is_super_admin='true') :
 *     INSERT/UPDATE/DELETE fonctionnent ;
 *   - écriture SANS le GUC (connexion app_runtime nue) : échoue toujours —
 *     preuve que is_super_admin() reste réellement appliqué, pas
 *     accidentellement désactivé par la correction du rôle.
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { getDb } from "@/lib/db/client"
import { withSystemContext } from "@/lib/db/tenant-context"
import { marketSignals, developmentProjects } from "@/lib/db/schema"

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

const signalIds: string[] = []
const projectIds: string[] = []

before(async () => {
  dbAvailable = await isDbAvailable()
})

after(async () => {
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    for (const id of signalIds) {
      await tx.delete(marketSignals).where(eq(marketSignals.id, id))
    }
    for (const id of projectIds) {
      await tx.delete(developmentProjects).where(eq(developmentProjects.id, id))
    }
  })
})

test("market_signals : lecture app_runtime fonctionne sans GUC particulier (policy *_read, USING(true))", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())

  const id = randomUUID()
  await withSystemContext((tx) =>
    tx.insert(marketSignals).values({
      id,
      title: "MARKET-CONTENT-RLS-ROLE-GAP-01 fixture",
      sourceUrl: "https://example.test/market-content-rls-gap-01",
      publishedAt: new Date(),
      confidence: "HIGH",
    }),
  )
  signalIds.push(id)

  const rows = await getDb()
    .select({ id: marketSignals.id })
    .from(marketSignals)
    .where(eq(marketSignals.id, id))
  assert.equal(
    rows.length,
    1,
    "app_runtime doit lire la ligne sans contexte super_admin — la lecture est publique",
  )
})

test("market_signals : INSERT/UPDATE/DELETE super_admin fonctionnent avec le GUC posé (withSystemContext)", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())

  const id = randomUUID()
  await withSystemContext((tx) =>
    tx.insert(marketSignals).values({
      id,
      title: "MARKET-CONTENT-RLS-ROLE-GAP-01 fixture write",
      sourceUrl: "https://example.test/market-content-rls-gap-01",
      publishedAt: new Date(),
      confidence: "LOW",
    }),
  )
  signalIds.push(id)

  await withSystemContext((tx) =>
    tx
      .update(marketSignals)
      .set({ confidence: "HIGH" })
      .where(eq(marketSignals.id, id)),
  )

  const [afterUpdate] = await withSystemContext((tx) =>
    tx
      .select({ confidence: marketSignals.confidence })
      .from(marketSignals)
      .where(eq(marketSignals.id, id)),
  )
  assert.equal(afterUpdate?.confidence, "HIGH")

  await withSystemContext((tx) =>
    tx.delete(marketSignals).where(eq(marketSignals.id, id)),
  )
  signalIds.splice(signalIds.indexOf(id), 1)

  const rows = await withSystemContext((tx) =>
    tx
      .select({ id: marketSignals.id })
      .from(marketSignals)
      .where(eq(marketSignals.id, id)),
  )
  assert.equal(rows.length, 0, "la ligne doit avoir été supprimée")
})

test("market_signals : INSERT échoue toujours SANS le GUC app.is_super_admin (is_super_admin() reste réellement appliqué)", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())

  await assert.rejects(
    () =>
      getDb().insert(marketSignals).values({
        title: "ne doit jamais être inséré",
        sourceUrl: "https://example.test/market-content-rls-gap-01",
        publishedAt: new Date(),
        confidence: "LOW",
      }),
    (err: unknown) => {
      // DrizzleQueryError enveloppe le vrai message Postgres dans `.cause`
      // (son propre .message n'est que "Failed query: ...").
      const cause = (err as { cause?: { message?: string } }).cause
      assert.match(cause?.message ?? "", /row-level security/i)
      return true
    },
    "sans app.is_super_admin='true', la policy market_signals_admin_write doit rejeter l'insert — jamais un faux succès",
  )
})

test("development_projects : lecture app_runtime fonctionne sans GUC particulier (policy *_read, USING(true))", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())

  const id = randomUUID()
  await withSystemContext((tx) =>
    tx.insert(developmentProjects).values({
      id,
      name: "MARKET-CONTENT-RLS-ROLE-GAP-01 fixture project",
      sourceUrl: "https://example.test/market-content-rls-gap-01",
      publishedAt: new Date(),
      confidence: "HIGH",
    }),
  )
  projectIds.push(id)

  const rows = await getDb()
    .select({ id: developmentProjects.id })
    .from(developmentProjects)
    .where(eq(developmentProjects.id, id))
  assert.equal(
    rows.length,
    1,
    "app_runtime doit lire la ligne sans contexte super_admin — la lecture est publique",
  )
})

test("development_projects : INSERT/UPDATE/DELETE super_admin fonctionnent avec le GUC posé (withSystemContext)", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())

  const id = randomUUID()
  await withSystemContext((tx) =>
    tx.insert(developmentProjects).values({
      id,
      name: "MARKET-CONTENT-RLS-ROLE-GAP-01 fixture write",
      sourceUrl: "https://example.test/market-content-rls-gap-01",
      publishedAt: new Date(),
      confidence: "LOW",
    }),
  )
  projectIds.push(id)

  await withSystemContext((tx) =>
    tx
      .update(developmentProjects)
      .set({ confidence: "HIGH" })
      .where(eq(developmentProjects.id, id)),
  )

  const [afterUpdate] = await withSystemContext((tx) =>
    tx
      .select({ confidence: developmentProjects.confidence })
      .from(developmentProjects)
      .where(eq(developmentProjects.id, id)),
  )
  assert.equal(afterUpdate?.confidence, "HIGH")

  await withSystemContext((tx) =>
    tx.delete(developmentProjects).where(eq(developmentProjects.id, id)),
  )
  projectIds.splice(projectIds.indexOf(id), 1)

  const rows = await withSystemContext((tx) =>
    tx
      .select({ id: developmentProjects.id })
      .from(developmentProjects)
      .where(eq(developmentProjects.id, id)),
  )
  assert.equal(rows.length, 0, "la ligne doit avoir été supprimée")
})

test("development_projects : INSERT échoue toujours SANS le GUC app.is_super_admin (is_super_admin() reste réellement appliqué)", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())

  await assert.rejects(
    () =>
      getDb().insert(developmentProjects).values({
        name: "ne doit jamais être inséré",
        sourceUrl: "https://example.test/market-content-rls-gap-01",
        publishedAt: new Date(),
        confidence: "LOW",
      }),
    (err: unknown) => {
      const cause = (err as { cause?: { message?: string } }).cause
      assert.match(cause?.message ?? "", /row-level security/i)
      return true
    },
    "sans app.is_super_admin='true', la policy development_projects_admin_write doit rejeter l'insert — jamais un faux succès",
  )
})
