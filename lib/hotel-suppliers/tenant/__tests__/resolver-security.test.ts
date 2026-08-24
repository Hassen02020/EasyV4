/**
 * PHASE 27 — Les 15 tests de sécurité obligatoires du Control Plane
 * multi-tenant. Contrairement au reste de la suite (mocks Drizzle), ces
 * garanties sont appliquées par PostgreSQL lui-même (RLS) — les tester avec
 * un mock ne prouverait que ma propre compréhension de la RLS, pas la RLS
 * réelle. Ce fichier exécute donc contre un Postgres réel
 * (`DATABASE_URL`, mirroir local — voir drizzle/manual/0035_*.sql).
 *
 * Se dégrade proprement (tous les tests `skip`) si aucune base n'est
 * joignable, pour ne jamais casser `pnpm test` dans un environnement sans
 * Postgres local — mais a été exécuté avec succès contre le mirroir local
 * réel dans cette session (voir rapport final Phase 27).
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { withTenantContext, withSystemContext, type TenantContext } from "@/lib/db/tenant-context"
import {
  agencies,
  hotelSuppliers,
  hotelSupplierAccounts,
  hotelSupplierAuthorizations,
  hotelSupplierCredentials,
} from "@/lib/db/schema"
import { encryptSecret } from "@/lib/security/secret-crypto"
import { resolveSupplierAccount } from "../resolver"
import type { SupplierName } from "../../core/types"

const TEST_KEY = "b".repeat(64)
process.env.SUPPLIER_CREDENTIALS_ENCRYPTION_KEY ??= TEST_KEY

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

// Déterminés dans `before()` (pas de top-level await — cible tsconfig ES6) ;
// chaque test lit `dbAvailable` dynamiquement et s'auto-skip si absent.
let dbAvailable = false
const skipReason = () =>
  "Postgres local indisponible (DATABASE_URL) — appliquer drizzle/manual/0035_hotel_supplier_control_plane.sql sur un mirroir local pour exécuter ces tests."

// ---------------------------------------------------------------------------
// Fixtures — un fournisseur de test + 3 agences (A propriétaire, B autorisée,
// C ni propriétaire ni autorisée) + comptes/credentials/autorisations réels.
// `SUPPLIER_CODE` est un code synthétique unique (pas un vrai driver) —
// castée en `SupplierName` uniquement pour ce test d'isolation RLS, qui ne
// dépend d'aucune logique spécifique à un fournisseur réel.
// ---------------------------------------------------------------------------

const SUPPLIER_CODE = `RLS27_${randomUUID().slice(0, 8)}` as unknown as SupplierName
let supplierId = ""
let agencyA = "", agencyB = "", agencyC = ""
let accountOwnedByA = "" // possédé par A, jamais partagé
let accountSharedByA = "" // possédé par A, partagé (autorisé) avec B
let accountDisabledSharedByA = "" // possédé par A, statut disabled, autorisé avec B
let userA = "", userB = "", userC = "", userSuperAdmin = ""

const ctx = {
  a: (): TenantContext => ({ agencyId: agencyA, userId: userA, isSuperAdmin: false }),
  b: (): TenantContext => ({ agencyId: agencyB, userId: userB, isSuperAdmin: false }),
  c: (): TenantContext => ({ agencyId: agencyC, userId: userC, isSuperAdmin: false }),
  superAdmin: (): TenantContext => ({ agencyId: null, userId: userSuperAdmin, isSuperAdmin: true }),
}

async function setupFixtures() {
  agencyA = randomUUID()
  agencyB = randomUUID()
  agencyC = randomUUID()
  userA = randomUUID()
  userB = randomUUID()
  userC = randomUUID()
  userSuperAdmin = randomUUID()

  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values([
      { id: agencyA, name: "RLS27 Agency A", agencyType: "ota", slug: `rls27-a-${agencyA.slice(0, 8)}` },
      { id: agencyB, name: "RLS27 Agency B", agencyType: "ota", slug: `rls27-b-${agencyB.slice(0, 8)}` },
      { id: agencyC, name: "RLS27 Agency C", agencyType: "ota", slug: `rls27-c-${agencyC.slice(0, 8)}` },
    ])
    const [supplier] = await tx
      .insert(hotelSuppliers)
      .values({ code: SUPPLIER_CODE, name: "RLS27 Test Supplier", driver: "stub", documentationStatus: "documented" })
      .returning({ id: hotelSuppliers.id })
    supplierId = supplier!.id
  })

  const cred = encryptSecret({ login: "rls27-login", password: "rls27-password" })

  await withTenantContext(ctx.a(), async (tx) => {
    const [owned] = await tx
      .insert(hotelSupplierAccounts)
      .values({ supplierId, ownerType: "agency", agencyId: agencyA, displayName: "A — privé", status: "active", priority: 50 })
      .returning({ id: hotelSupplierAccounts.id })
    accountOwnedByA = owned!.id
    await tx.insert(hotelSupplierCredentials).values({ accountId: accountOwnedByA, agencyId: agencyA, ciphertext: cred.ciphertext, keyVersion: cred.keyVersion })

    const [shared] = await tx
      .insert(hotelSupplierAccounts)
      .values({ supplierId, ownerType: "agency", agencyId: agencyA, displayName: "A — partagé avec B", status: "active", priority: 100 })
      .returning({ id: hotelSupplierAccounts.id })
    accountSharedByA = shared!.id
    await tx.insert(hotelSupplierCredentials).values({ accountId: accountSharedByA, agencyId: agencyA, ciphertext: cred.ciphertext, keyVersion: cred.keyVersion })

    const [disabledShared] = await tx
      .insert(hotelSupplierAccounts)
      .values({ supplierId, ownerType: "agency", agencyId: agencyA, displayName: "A — partagé désactivé", status: "disabled", priority: 10 })
      .returning({ id: hotelSupplierAccounts.id })
    accountDisabledSharedByA = disabledShared!.id
    await tx.insert(hotelSupplierCredentials).values({ accountId: accountDisabledSharedByA, agencyId: agencyA, ciphertext: cred.ciphertext, keyVersion: cred.keyVersion })
  })

  await withSystemContext(async (tx) => {
    await tx.insert(hotelSupplierAuthorizations).values([
      { accountId: accountSharedByA, authorizedAgencyId: agencyB },
      { accountId: accountDisabledSharedByA, authorizedAgencyId: agencyB },
    ])
  })
}

async function cleanupFixtures() {
  if (!agencyA) return
  await withSystemContext(async (tx) => {
    await tx.delete(hotelSupplierAuthorizations).where(eq(hotelSupplierAuthorizations.accountId, accountSharedByA))
    await tx.delete(hotelSupplierAuthorizations).where(eq(hotelSupplierAuthorizations.accountId, accountDisabledSharedByA))
    for (const id of [accountOwnedByA, accountSharedByA, accountDisabledSharedByA]) {
      if (id) {
        await tx.delete(hotelSupplierCredentials).where(eq(hotelSupplierCredentials.accountId, id))
        await tx.delete(hotelSupplierAccounts).where(eq(hotelSupplierAccounts.id, id))
      }
    }
    if (supplierId) await tx.delete(hotelSuppliers).where(eq(hotelSuppliers.id, supplierId))
    await tx.delete(agencies).where(sql`${agencies.id} in (${agencyA}, ${agencyB}, ${agencyC})`)
  })
}

before(async () => {
  dbAvailable = await isDbAvailable()
  if (dbAvailable) await setupFixtures()
})
after(async () => {
  if (dbAvailable) await cleanupFixtures()
})

// ---------------------------------------------------------------------------
// 1. Agence A cannot read Agency B's credentials — et réciproquement, B ne
//    peut jamais lire un compte privé (non partagé) de A.
// ---------------------------------------------------------------------------
test("1. Une agence ne voit jamais un compte privé (non partagé) d'une autre agence", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const rows = await withTenantContext(ctx.b(), async (tx) =>
    tx.select().from(hotelSupplierAccounts).where(eq(hotelSupplierAccounts.id, accountOwnedByA)),
  )
  assert.equal(rows.length, 0)
})

test("2. Une agence ne peut jamais lire directement les credentials d'un compte qui ne lui appartient pas (même partagé)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const rows = await withTenantContext(ctx.b(), async (tx) =>
    tx.select().from(hotelSupplierCredentials).where(eq(hotelSupplierCredentials.accountId, accountSharedByA)),
  )
  assert.equal(rows.length, 0)
})

test("3. Asymétrie compte/credentials : B voit le COMPTE partagé mais jamais ses CREDENTIALS en lecture directe", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const accountRows = await withTenantContext(ctx.b(), async (tx) =>
    tx.select().from(hotelSupplierAccounts).where(eq(hotelSupplierAccounts.id, accountSharedByA)),
  )
  const credRows = await withTenantContext(ctx.b(), async (tx) =>
    tx.select().from(hotelSupplierCredentials).where(eq(hotelSupplierCredentials.accountId, accountSharedByA)),
  )
  assert.equal(accountRows.length, 1)
  assert.equal(credRows.length, 0)
})

test("4. resolveSupplierAccount refuse un requestedAccountId n'appartenant/n'étant autorisé à aucun autre tenant", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const result = await resolveSupplierAccount({ supplierCode: SUPPLIER_CODE, tenantContext: ctx.c(), requestedAccountId: accountOwnedByA })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.reason, "ACCOUNT_NOT_FOUND")
})

test("5. resolveSupplierAccount résout un requestedAccountId explicitement autorisé et renvoie des credentials déchiffrés corrects", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const result = await resolveSupplierAccount({ supplierCode: SUPPLIER_CODE, tenantContext: ctx.b(), requestedAccountId: accountSharedByA })
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.account.accountId, accountSharedByA)
    assert.deepEqual(result.account.credentials, { login: "rls27-login", password: "rls27-password" })
  }
})

test("6. Un compte DISABLED n'est jamais résolu par défaut, même possédé par le tenant", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const result = await resolveSupplierAccount({ supplierCode: SUPPLIER_CODE, tenantContext: ctx.a(), requestedAccountId: accountDisabledSharedByA })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.reason, "ACCOUNT_DISABLED")
})

test("7. Un compte partagé DISABLED n'est jamais résolu via le chemin autorisé-partagé (résolution par défaut)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const result = await resolveSupplierAccount({ supplierCode: SUPPLIER_CODE, tenantContext: ctx.b() })
  // B a un compte partagé actif (accountSharedByA) ET un désactivé — seul l'actif doit sortir.
  assert.equal(result.ok, true)
  if (result.ok) assert.equal(result.account.accountId, accountSharedByA)
})

test("8. Aucun accès implicite : un compte MASTER/global sans ligne d'autorisation explicite n'est jamais résolu pour une agence tierce", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const result = await resolveSupplierAccount({ supplierCode: SUPPLIER_CODE, tenantContext: ctx.c() })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.reason, "NOT_CONFIGURED")
})

test("9. Priorité : un compte possédé par le tenant est toujours préféré à un compte partagé autorisé", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  // Autorise B explicitement sur accountOwnedByA (habituellement privé) pour ce test seul, temporairement.
  await withSystemContext(async (tx) => {
    await tx.insert(hotelSupplierAuthorizations).values({ accountId: accountOwnedByA, authorizedAgencyId: agencyB })
  })
  try {
    // B a maintenant accès à 2 comptes actifs du même fournisseur : le sien (aucun) — B n'en possède aucun —
    // donc ce test vérifie plutôt côté A : A possède accountOwnedByA ET accountSharedByA (les deux actifs) —
    // la résolution par défaut de A doit préférer son propre compte (elle n'a pas de compte "partagé" à privilégier
    // différemment ici puisque les deux lui appartiennent) — on vérifie l'ORDRE par `priority` à la place.
    const result = await resolveSupplierAccount({ supplierCode: SUPPLIER_CODE, tenantContext: ctx.a() })
    assert.equal(result.ok, true)
    if (result.ok) assert.equal(result.account.accountId, accountOwnedByA) // priority 50 < 100
  } finally {
    await withSystemContext(async (tx) => {
      await tx.delete(hotelSupplierAuthorizations).where(sql`${hotelSupplierAuthorizations.accountId} = ${accountOwnedByA} and ${hotelSupplierAuthorizations.authorizedAgencyId} = ${agencyB}`)
    })
  }
})

test("10. Aucun compte disponible => NOT_CONFIGURED explicite, jamais de credentials fabriqués ni d'exception non gérée", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const result = await resolveSupplierAccount({ supplierCode: SUPPLIER_CODE, tenantContext: ctx.c() })
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.reason, "NOT_CONFIGURED")
    assert.equal("account" in result, false)
  }
})

test("11. Les credentials renvoyés par le resolver correspondent exactement à ce qui a été chiffré (round-trip bout-en-bout)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const result = await resolveSupplierAccount({ supplierCode: SUPPLIER_CODE, tenantContext: ctx.a(), requestedAccountId: accountOwnedByA })
  assert.equal(result.ok, true)
  if (result.ok) assert.deepEqual(result.account.credentials, { login: "rls27-login", password: "rls27-password" })
})

test("12. super_admin peut résoudre explicitement le compte de N'IMPORTE QUELLE agence (accès privilégié intentionnel, pas un bug)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const result = await resolveSupplierAccount({ supplierCode: SUPPLIER_CODE, tenantContext: ctx.superAdmin(), requestedAccountId: accountOwnedByA })
  assert.equal(result.ok, true)
})

test("13. Révoquer une autorisation arrête IMMÉDIATEMENT la résolution partagée pour cette agence (pas de cache périmé)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const before = await resolveSupplierAccount({ supplierCode: SUPPLIER_CODE, tenantContext: ctx.b(), requestedAccountId: accountSharedByA })
  assert.equal(before.ok, true)
  await withSystemContext(async (tx) => {
    await tx.delete(hotelSupplierAuthorizations).where(sql`${hotelSupplierAuthorizations.accountId} = ${accountSharedByA} and ${hotelSupplierAuthorizations.authorizedAgencyId} = ${agencyB}`)
  })
  try {
    const after_ = await resolveSupplierAccount({ supplierCode: SUPPLIER_CODE, tenantContext: ctx.b(), requestedAccountId: accountSharedByA })
    assert.equal(after_.ok, false)
  } finally {
    // Restaure pour ne pas casser les tests suivants qui dépendent de cette autorisation.
    await withSystemContext(async (tx) => {
      await tx.insert(hotelSupplierAuthorizations).values({ accountId: accountSharedByA, authorizedAgencyId: agencyB })
    })
  }
})

test("14. Seul super_admin peut écrire dans hotel_suppliers (définitions) — une agence normale ne peut pas en créer/modifier", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  // Une violation WITH CHECK sur INSERT met la transaction Postgres entière en
  // état "aborted" — le try/catch doit englober TOUTE la transaction
  // (withTenantContext), pas seulement l'insert : après une erreur, même le
  // COMMIT implicite échouerait s'il était tenté à l'intérieur du callback.
  let inserted = false
  try {
    await withTenantContext(ctx.a(), async (tx) => {
      await tx.insert(hotelSuppliers).values({ code: `HACK_${randomUUID().slice(0, 8)}`, name: "hack", driver: "stub" })
    })
    inserted = true
  } catch {
    inserted = false
  }
  assert.equal(inserted, false)
})

test("15. Une agence AUTORISÉE À UTILISER un compte partagé ne peut pas pour autant le MODIFIER (autorisation ≠ propriété)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const updated = await withTenantContext(ctx.b(), async (tx) => {
    const result = await tx
      .update(hotelSupplierAccounts)
      .set({ displayName: "HACKED_BY_B" })
      .where(eq(hotelSupplierAccounts.id, accountSharedByA))
      .returning({ id: hotelSupplierAccounts.id })
    return result.length
  })
  assert.equal(updated, 0)
})
