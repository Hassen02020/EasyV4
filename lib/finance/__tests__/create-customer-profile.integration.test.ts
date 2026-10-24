/**
 * WALLET-GUEST-INTEGRATION-TESTS-01 — Tests d'intégration réels (Postgres,
 * rôle app_runtime) pour la logique de création de profil client B2C.
 *
 * Contexte : `createCustomerProfile` (server action) est une enveloppe Next.js
 * qui résout user+agencyId côté serveur puis délègue à
 * `resolveOrCreateLinkedCustomer`. Ce fichier teste cette logique métier
 * directement contre Postgres, sans session Supabase ni HTTP.
 *
 * Invariants vérifiés :
 *  T1 — Création basique : customer créé, tous les champs attendus présents.
 *  T2 — Idempotence : deux appels identiques → même customerId, 1 seule row.
 *  T3 — Isolation tenant : même email, agencyIds distincts → 2 rows distinctes.
 *  T4 — linkedAuthUserId posé sur nouvelle row.
 *  T5 — linkedAuthUserId NON écrasé si row existante avec authUserId déjà posé.
 *  T6 — linkedAuthUserId posé sur row existante sans authUserId (guest → auth).
 *  T7 — Aucune écriture financière lors de la création (wallet_accounts = 0).
 *  T8 — RLS : customer lisible sous le bon contexte tenant (withTenantContext).
 *  T9 — RLS : customer invisible sous un contexte tenant différent.
 *
 * Convention : fixtures nommées `wgi01-cpXX-<uuid>` pour nettoyage ciblé.
 * Même pattern que customer-topup-webhook-core.integration.test.ts.
 */

import test, { before } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, and, sql, count } from "drizzle-orm"

import { withSystemContext, withTenantContext } from "@/lib/db/tenant-context"
import type { TenantContext } from "@/lib/db/tenant-context"
import { agencies, customers, walletAccounts } from "@/lib/db/schema"
import { resolveOrCreateLinkedCustomer } from "@/lib/booking/customer-identity"

/* -------------------------------------------------------------------------- */
/* DB availability guard                                                       */
/* -------------------------------------------------------------------------- */

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
const skip = () =>
  "Postgres local indisponible (DATABASE_URL) — voir customer-topup-webhook-core.integration.test.ts pour la procédure."

before(async () => {
  dbAvailable = await isDbAvailable()
})

/* -------------------------------------------------------------------------- */
/* Helpers fixtures                                                            */
/* -------------------------------------------------------------------------- */

const TEST_PREFIX = "wgi01-cp"

async function createTestAgency(): Promise<string> {
  const agencyId = randomUUID()
  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values({
      id: agencyId,
      slug: `${TEST_PREFIX}${agencyId.slice(0, 8)}`,
      name: "WALLET-GUEST-INTEGRATION-TESTS-01 — agence test",
      agencyType: "ota",
    })
  })
  return agencyId
}

async function cleanupAgency(agencyId: string): Promise<void> {
  await withSystemContext(async (tx) => {
    await tx.delete(customers).where(eq(customers.agencyId, agencyId))
    await tx.delete(agencies).where(eq(agencies.id, agencyId))
  })
}

function testEmail(label: string): string {
  return `${TEST_PREFIX}${label}-${randomUUID().slice(0, 8)}@test.invalid`
}

/* -------------------------------------------------------------------------- */
/* T1 — Création basique                                                       */
/* -------------------------------------------------------------------------- */

test("WALLET-GUEST-INTEGRATION T1: resolveOrCreateLinkedCustomer crée un customer, retourne son ID", async (t) => {
  if (!dbAvailable) return t.skip(skip())

  const agencyId = await createTestAgency()
  try {
    const email = testEmail("t1")
    const customerId = await withSystemContext((tx) =>
      resolveOrCreateLinkedCustomer(tx, {
        agencyId,
        traveler: { firstName: "Alice", lastName: "Martin", email },
        linkedAuthUserId: null,
      }),
    )

    assert.ok(customerId, "customerId non vide")

    const [row] = await withSystemContext((tx) =>
      tx.select().from(customers).where(eq(customers.id, customerId)).limit(1),
    )
    assert.ok(row, "row customer introuvable après création")
    assert.equal(row.agencyId, agencyId)
    assert.equal(row.firstName, "Alice")
    assert.equal(row.lastName, "Martin")
    assert.equal(row.email, email)
    assert.equal(
      row.authUserId,
      null,
      "authUserId doit être null (aucun linkedAuthUserId)",
    )
  } finally {
    await cleanupAgency(agencyId)
  }
})

/* -------------------------------------------------------------------------- */
/* T2 — Idempotence                                                            */
/* -------------------------------------------------------------------------- */

test("WALLET-GUEST-INTEGRATION T2: deux appels identiques retournent le même customerId, 1 seule row", async (t) => {
  if (!dbAvailable) return t.skip(skip())

  const agencyId = await createTestAgency()
  try {
    const email = testEmail("t2")
    const params = {
      agencyId,
      traveler: { firstName: "Bob", lastName: "Dupont", email },
      linkedAuthUserId: null,
    }

    const id1 = await withSystemContext((tx) =>
      resolveOrCreateLinkedCustomer(tx, params),
    )
    const id2 = await withSystemContext((tx) =>
      resolveOrCreateLinkedCustomer(tx, params),
    )

    assert.equal(id1, id2, "second appel doit retourner le même ID")

    const rows = await withSystemContext((tx) =>
      tx
        .select()
        .from(customers)
        .where(
          and(eq(customers.agencyId, agencyId), eq(customers.email, email)),
        ),
    )
    assert.equal(rows.length, 1, "une seule row en base (pas de doublon)")
  } finally {
    await cleanupAgency(agencyId)
  }
})

/* -------------------------------------------------------------------------- */
/* T3 — Isolation tenant                                                       */
/* -------------------------------------------------------------------------- */

test("WALLET-GUEST-INTEGRATION T3: même email, agencyIds différents → 2 customers distincts", async (t) => {
  if (!dbAvailable) return t.skip(skip())

  const agencyA = await createTestAgency()
  const agencyB = await createTestAgency()
  const email = testEmail("t3-shared")

  try {
    const idA = await withSystemContext((tx) =>
      resolveOrCreateLinkedCustomer(tx, {
        agencyId: agencyA,
        traveler: { firstName: "Shared", lastName: "User", email },
        linkedAuthUserId: null,
      }),
    )
    const idB = await withSystemContext((tx) =>
      resolveOrCreateLinkedCustomer(tx, {
        agencyId: agencyB,
        traveler: { firstName: "Shared", lastName: "User", email },
        linkedAuthUserId: null,
      }),
    )

    assert.notEqual(
      idA,
      idB,
      "deux IDs distincts pour deux agences différentes",
    )

    const rowA = await withSystemContext((tx) =>
      tx.select().from(customers).where(eq(customers.id, idA)).limit(1),
    )
    const rowB = await withSystemContext((tx) =>
      tx.select().from(customers).where(eq(customers.id, idB)).limit(1),
    )

    assert.equal(rowA[0]?.agencyId, agencyA)
    assert.equal(rowB[0]?.agencyId, agencyB)
  } finally {
    await cleanupAgency(agencyA)
    await cleanupAgency(agencyB)
  }
})

/* -------------------------------------------------------------------------- */
/* T4 — linkedAuthUserId posé sur nouvelle row                                 */
/* -------------------------------------------------------------------------- */

test("WALLET-GUEST-INTEGRATION T4: linkedAuthUserId posé sur nouvelle row (inscription sans réservation)", async (t) => {
  if (!dbAvailable) return t.skip(skip())

  const agencyId = await createTestAgency()
  const authUserId = randomUUID()

  try {
    const email = testEmail("t4")
    const customerId = await withSystemContext((tx) =>
      resolveOrCreateLinkedCustomer(tx, {
        agencyId,
        traveler: { firstName: "Carole", lastName: "Lemaire", email },
        linkedAuthUserId: authUserId,
      }),
    )

    const [row] = await withSystemContext((tx) =>
      tx.select().from(customers).where(eq(customers.id, customerId)).limit(1),
    )
    assert.equal(
      row?.authUserId,
      authUserId,
      "authUserId doit être posé sur la nouvelle row",
    )
  } finally {
    await cleanupAgency(agencyId)
  }
})

/* -------------------------------------------------------------------------- */
/* T5 — linkedAuthUserId NON écrasé sur row existante déjà liée               */
/* -------------------------------------------------------------------------- */

test("WALLET-GUEST-INTEGRATION T5: linkedAuthUserId NON écrasé si row existante a déjà un authUserId", async (t) => {
  if (!dbAvailable) return t.skip(skip())

  const agencyId = await createTestAgency()
  const originalAuthUserId = randomUUID()
  const newAuthUserId = randomUUID()

  try {
    const email = testEmail("t5")

    // Premier appel : pose l'authUserId original
    const customerId = await withSystemContext((tx) =>
      resolveOrCreateLinkedCustomer(tx, {
        agencyId,
        traveler: { firstName: "David", lastName: "Moreau", email },
        linkedAuthUserId: originalAuthUserId,
      }),
    )

    // Second appel avec un nouvel authUserId différent — NE doit PAS écraser
    await withSystemContext((tx) =>
      resolveOrCreateLinkedCustomer(tx, {
        agencyId,
        traveler: { firstName: "David", lastName: "Moreau", email },
        linkedAuthUserId: newAuthUserId,
      }),
    )

    const [row] = await withSystemContext((tx) =>
      tx.select().from(customers).where(eq(customers.id, customerId)).limit(1),
    )
    assert.equal(
      row?.authUserId,
      originalAuthUserId,
      "authUserId original préservé — jamais écrasé si déjà présent",
    )
  } finally {
    await cleanupAgency(agencyId)
  }
})

/* -------------------------------------------------------------------------- */
/* T6 — linkedAuthUserId posé sur row existante SANS authUserId (guest → auth) */
/* -------------------------------------------------------------------------- */

test("WALLET-GUEST-INTEGRATION T6: linkedAuthUserId posé sur row existante sans authUserId (parcours guest → auth)", async (t) => {
  if (!dbAvailable) return t.skip(skip())

  const agencyId = await createTestAgency()
  const authUserId = randomUUID()

  try {
    const email = testEmail("t6")

    // Premier appel guest : pas d'authUserId
    const customerId = await withSystemContext((tx) =>
      resolveOrCreateLinkedCustomer(tx, {
        agencyId,
        traveler: { firstName: "Eva", lastName: "Bernard", email },
        linkedAuthUserId: null,
      }),
    )

    // Vérification intermédiaire : authUserId null
    const [before] = await withSystemContext((tx) =>
      tx.select().from(customers).where(eq(customers.id, customerId)).limit(1),
    )
    assert.equal(before?.authUserId, null)

    // Second appel avec authUserId (après inscription)
    await withSystemContext((tx) =>
      resolveOrCreateLinkedCustomer(tx, {
        agencyId,
        traveler: { firstName: "Eva", lastName: "Bernard", email },
        linkedAuthUserId: authUserId,
      }),
    )

    const [after] = await withSystemContext((tx) =>
      tx.select().from(customers).where(eq(customers.id, customerId)).limit(1),
    )
    assert.equal(
      after?.authUserId,
      authUserId,
      "authUserId posé sur row existante sans authUserId",
    )
  } finally {
    await cleanupAgency(agencyId)
  }
})

/* -------------------------------------------------------------------------- */
/* T7 — Aucune écriture financière lors de la création du profil              */
/* -------------------------------------------------------------------------- */

test("WALLET-GUEST-INTEGRATION T7: resolveOrCreateLinkedCustomer n'écrit aucune ligne wallet_accounts", async (t) => {
  if (!dbAvailable) return t.skip(skip())

  const agencyId = await createTestAgency()

  try {
    const email = testEmail("t7")
    const customerId = await withSystemContext((tx) =>
      resolveOrCreateLinkedCustomer(tx, {
        agencyId,
        traveler: { firstName: "Frank", lastName: "Petit", email },
        linkedAuthUserId: randomUUID(),
      }),
    )

    // Vérifier qu'aucun wallet_account n'a été créé pour ce customer
    const walletRows = await withSystemContext((tx) =>
      tx
        .select({ cnt: count() })
        .from(walletAccounts)
        .where(eq(walletAccounts.customerId, customerId)),
    )
    assert.equal(
      Number(walletRows[0]?.cnt ?? 0),
      0,
      "aucun wallet_account créé lors de resolveOrCreateLinkedCustomer",
    )
  } finally {
    await cleanupAgency(agencyId)
  }
})

/* -------------------------------------------------------------------------- */
/* T8 — RLS : customer lisible sous le bon contexte tenant                    */
/* -------------------------------------------------------------------------- */

test("WALLET-GUEST-INTEGRATION T8: RLS — customer lisible sous withTenantContext(agencyA)", async (t) => {
  if (!dbAvailable) return t.skip(skip())

  const agencyId = await createTestAgency()
  const syntheticUserId = randomUUID()

  try {
    const email = testEmail("t8")

    // Création via withSystemContext (super-admin bypass RLS)
    const customerId = await withSystemContext((tx) =>
      resolveOrCreateLinkedCustomer(tx, {
        agencyId,
        traveler: { firstName: "Grace", lastName: "Tran", email },
        linkedAuthUserId: null,
      }),
    )

    // Lecture via withTenantContext — doit trouver la row
    const tenantCtx: TenantContext = {
      agencyId,
      userId: syntheticUserId,
      isSuperAdmin: false,
    }
    const rows = await withTenantContext(tenantCtx, (tx) =>
      tx.select().from(customers).where(eq(customers.id, customerId)),
    )
    assert.equal(
      rows.length,
      1,
      "customer doit être lisible sous le contexte tenant correct",
    )
  } finally {
    await cleanupAgency(agencyId)
  }
})

/* -------------------------------------------------------------------------- */
/* T9 — RLS : customer invisible sous contexte tenant différent               */
/* -------------------------------------------------------------------------- */

test("WALLET-GUEST-INTEGRATION T9: RLS — customer invisible sous withTenantContext(agencyB)", async (t) => {
  if (!dbAvailable) return t.skip(skip())

  const agencyA = await createTestAgency()
  const agencyB = await createTestAgency()
  const syntheticUserId = randomUUID()

  try {
    const email = testEmail("t9")

    // Création dans agencyA
    const customerId = await withSystemContext((tx) =>
      resolveOrCreateLinkedCustomer(tx, {
        agencyId: agencyA,
        traveler: { firstName: "Henri", lastName: "Duval", email },
        linkedAuthUserId: null,
      }),
    )

    // Lecture avec contexte agencyB — doit renvoyer 0 rows
    const ctxB: TenantContext = {
      agencyId: agencyB,
      userId: syntheticUserId,
      isSuperAdmin: false,
    }
    const rows = await withTenantContext(ctxB, (tx) =>
      tx.select().from(customers).where(eq(customers.id, customerId)),
    )
    assert.equal(
      rows.length,
      0,
      "customer d'agencyA invisible sous contexte agencyB (RLS tenant isolation)",
    )
  } finally {
    await cleanupAgency(agencyA)
    await cleanupAgency(agencyB)
  }
})
