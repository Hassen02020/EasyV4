/**
 * PUBLIC-VISUAL-RLS-ROLE-GAP-01 — preuve live contre un Postgres réel, même
 * convention que lib/finance/__tests__/reconciliation.test.ts : se dégrade
 * en `skip` sans DATABASE_URL/Postgres local disponible.
 *
 * Régression : `drizzle/manual/0097_public_visual_content.sql` créait les
 * policies RLS de `public_module_visuals`/`public_site_settings`/
 * `public_promotions` avec `TO authenticated` — un rôle Supabase/PostgREST
 * dont `app_runtime` (le rôle Postgres RÉEL utilisé par `DATABASE_URL`)
 * n'est jamais membre. Avec `FORCE ROW LEVEL SECURITY`, aucune policy ne
 * s'appliquait à `app_runtime` → 0 ligne retournée, silencieusement, pour
 * CHAQUE lecture (`getPublicModuleVisuals`/`getPublicSiteConfig`/
 * `getPublicPromotions`), sans jamais lever d'exception.
 *
 * `drizzle/manual/0119_public_visual_rls_role_gap.sql` recrée les 6
 * policies sans restriction de rôle — même convention que toutes les
 * autres policies RLS du dépôt. Ce test, exécuté avec le `DATABASE_URL` réel
 * de l'environnement (jamais une connexion superuser/bypass RLS), aurait
 * échoué avant 0119 et doit rester vert après.
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import { agencies, publicModuleVisuals } from "@/lib/db/schema"

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
  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values({
      id: agencyId,
      slug: `rls-gap-01-${agencyId.slice(0, 8)}`,
      name: "PUBLIC-VISUAL-RLS-ROLE-GAP-01 fixture",
      agencyType: "partner",
    })
    await tx.insert(publicModuleVisuals).values({
      agencyId,
      moduleSlug: "hotels-tunisie",
      enabled: true,
      sortOrder: 10,
    })
  })
})

after(async () => {
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    await tx.delete(publicModuleVisuals).where(eq(publicModuleVisuals.agencyId, agencyId))
    await tx.delete(agencies).where(eq(agencies.id, agencyId))
  })
})

test("public_module_visuals : lisible par le rôle de connexion réel (app_runtime), pas seulement par un rôle 'authenticated' inexistant côté app", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())

  const rows = await withSystemContext(async (tx) =>
    tx
      .select({ moduleSlug: publicModuleVisuals.moduleSlug })
      .from(publicModuleVisuals)
      .where(eq(publicModuleVisuals.agencyId, agencyId)),
  )

  assert.equal(
    rows.length,
    1,
    "la ligne seedée pour cette agence doit être visible — si 0, la policy RLS restreint encore le rôle de connexion réel",
  )
  assert.equal(rows[0].moduleSlug, "hotels-tunisie")
})
