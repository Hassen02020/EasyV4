/**
 * WALLET-GUEST-INTEGRATION-TESTS-01 — Tests d'intégration réels (Postgres,
 * rôle app_runtime) pour `linkGuestCustomerToAuth`.
 *
 * Contexte : `linkGuestCustomerToAuth` est appelée après l'inscription d'un
 * utilisateur, pour lier les réservations effectuées en guest (authUserId=NULL)
 * au compte auth qui vient d'être créé (agencyId + email ilike + authUserId IS NULL).
 *
 * Invariants vérifiés :
 *  T1 — Liaison guest : row authUserId=NULL → { linked: true }, authUserId posé.
 *  T2 — Déjà lié : row avec authUserId → { linked: false, skipped: "no_guest_row" }.
 *  T3 — Collision : 2 rows guest même email même agence →
 *        { linked: false, skipped: "collision" }, aucune mise à jour.
 *  T4 — Email case-insensitive (ilike) : "user@TEST.invalid" lie "user@test.invalid".
 *  T5 — Isolation tenant : wrong agencyId → { linked: false, skipped: "no_guest_row" }.
 *  T6 — Aucune row : { linked: false, skipped: "no_guest_row" }.
 *
 * Convention : fixtures nommées `wgi01-lgXX-<uuid>` pour nettoyage ciblé.
 * Même pattern que customer-topup-webhook-core.integration.test.ts.
 */

import test, { before } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"

import { withSystemContext } from "@/lib/db/tenant-context"
import { agencies, customers } from "@/lib/db/schema"
import { linkGuestCustomerToAuth } from "@/lib/booking/customer-identity"

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

const TEST_PREFIX = "wgi01-lg"

async function createTestAgency(): Promise<string> {
  const agencyId = randomUUID()
  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values({
      id: agencyId,
      slug: `${TEST_PREFIX}${agencyId.slice(0, 8)}`,
      name: "WALLET-GUEST-INTEGRATION-TESTS-01 — agence test (link)",
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

async function insertGuestCustomer(
  agencyId: string,
  email: string,
  authUserId: string | null = null,
): Promise<string> {
  const customerId = randomUUID()
  await withSystemContext(async (tx) => {
    await tx.insert(customers).values({
      id: customerId,
      agencyId,
      firstName: "Guest",
      lastName: "Test",
      email,
      authUserId,
    })
  })
  return customerId
}

function testEmail(label: string): string {
  return `${TEST_PREFIX}${label}-${randomUUID().slice(0, 8)}@test.invalid`
}

/* -------------------------------------------------------------------------- */
/* T1 — Liaison guest : authUserId=NULL → { linked: true }                    */
/* -------------------------------------------------------------------------- */

test("WALLET-GUEST-INTEGRATION T1: linkGuestCustomerToAuth — guest sans authUserId → { linked: true }, authUserId posé", async (t) => {
  if (!dbAvailable) return t.skip(skip())

  const agencyId = await createTestAgency()
  const userId = randomUUID()

  try {
    const email = testEmail("t1")
    const customerId = await insertGuestCustomer(agencyId, email, null)

    const result = await withSystemContext((tx) =>
      linkGuestCustomerToAuth(tx, { agencyId, email, userId }),
    )

    assert.deepEqual(
      result,
      { linked: true },
      "doit retourner { linked: true }",
    )

    // Vérifier que authUserId a bien été posé en base
    const [row] = await withSystemContext((tx) =>
      tx.select().from(customers).where(eq(customers.id, customerId)).limit(1),
    )
    assert.equal(row?.authUserId, userId, "authUserId doit être posé en base")
  } finally {
    await cleanupAgency(agencyId)
  }
})

/* -------------------------------------------------------------------------- */
/* T2 — Déjà lié : row avec authUserId → { linked: false, skipped: "no_guest_row" } */
/* -------------------------------------------------------------------------- */

test("WALLET-GUEST-INTEGRATION T2: linkGuestCustomerToAuth — customer déjà lié → { skipped: 'no_guest_row' }", async (t) => {
  if (!dbAvailable) return t.skip(skip())

  const agencyId = await createTestAgency()
  const existingUserId = randomUUID()
  const newUserId = randomUUID()

  try {
    const email = testEmail("t2")
    // Row déjà liée (authUserId posé)
    await insertGuestCustomer(agencyId, email, existingUserId)

    const result = await withSystemContext((tx) =>
      linkGuestCustomerToAuth(tx, { agencyId, email, userId: newUserId }),
    )

    assert.equal(result.linked, false)
    assert.equal(
      (result as { linked: false; skipped: string }).skipped,
      "no_guest_row",
      "aucune row guest trouvée car authUserId déjà posé",
    )

    // Vérifier que l'authUserId d'origine n'a pas été écrasé
    const [row] = await withSystemContext((tx) =>
      tx
        .select()
        .from(customers)
        .where(eq(customers.agencyId, agencyId))
        .limit(1),
    )
    assert.equal(
      row?.authUserId,
      existingUserId,
      "authUserId original préservé",
    )
  } finally {
    await cleanupAgency(agencyId)
  }
})

/* -------------------------------------------------------------------------- */
/* T3 — Collision : 2 rows guest même email → { skipped: "collision" }       */
/* -------------------------------------------------------------------------- */

test("WALLET-GUEST-INTEGRATION T3: linkGuestCustomerToAuth — 2 rows guest même email → { skipped: 'collision' }, aucune mise à jour", async (t) => {
  if (!dbAvailable) return t.skip(skip())

  const agencyId = await createTestAgency()
  const userId = randomUUID()

  try {
    const email = testEmail("t3")
    // Deux rows guest avec le même email (authUserId=null)
    const id1 = await insertGuestCustomer(agencyId, email, null)
    const id2 = await insertGuestCustomer(agencyId, email, null)

    const result = await withSystemContext((tx) =>
      linkGuestCustomerToAuth(tx, { agencyId, email, userId }),
    )

    assert.equal(result.linked, false)
    assert.equal(
      (result as { linked: false; skipped: string }).skipped,
      "collision",
      "collision détectée : 2 rows guest pour le même email",
    )

    // Vérifier qu'aucun authUserId n'a été posé
    const rows = await withSystemContext((tx) =>
      tx.select().from(customers).where(eq(customers.agencyId, agencyId)),
    )
    for (const row of rows) {
      assert.equal(
        row.authUserId,
        null,
        `authUserId doit rester null pour customer ${row.id}`,
      )
    }
    void id1
    void id2
  } finally {
    await cleanupAgency(agencyId)
  }
})

/* -------------------------------------------------------------------------- */
/* T4 — Email case-insensitive (ilike)                                        */
/* -------------------------------------------------------------------------- */

test("WALLET-GUEST-INTEGRATION T4: linkGuestCustomerToAuth — email case-insensitive (ilike)", async (t) => {
  if (!dbAvailable) return t.skip(skip())

  const agencyId = await createTestAgency()
  const userId = randomUUID()

  try {
    const baseEmail = testEmail("t4")
    // Insertion avec l'email en minuscules
    const customerId = await insertGuestCustomer(agencyId, baseEmail, null)

    // Liaison avec l'email partiellement en majuscules
    const upperEmail = baseEmail.toUpperCase()
    const result = await withSystemContext((tx) =>
      linkGuestCustomerToAuth(tx, { agencyId, email: upperEmail, userId }),
    )

    assert.equal(
      result.linked,
      true,
      "linkGuestCustomerToAuth doit être case-insensitive",
    )

    const [row] = await withSystemContext((tx) =>
      tx.select().from(customers).where(eq(customers.id, customerId)).limit(1),
    )
    assert.equal(
      row?.authUserId,
      userId,
      "authUserId posé malgré casse différente",
    )
  } finally {
    await cleanupAgency(agencyId)
  }
})

/* -------------------------------------------------------------------------- */
/* T5 — Isolation tenant : wrong agencyId → { skipped: "no_guest_row" }      */
/* -------------------------------------------------------------------------- */

test("WALLET-GUEST-INTEGRATION T5: linkGuestCustomerToAuth — wrong agencyId → { skipped: 'no_guest_row' } (isolation tenant)", async (t) => {
  if (!dbAvailable) return t.skip(skip())

  const agencyA = await createTestAgency()
  const agencyB = await createTestAgency()
  const userId = randomUUID()

  try {
    const email = testEmail("t5")
    // Guest créé dans agencyA
    const customerId = await insertGuestCustomer(agencyA, email, null)

    // Liaison tentée avec agencyB — ne doit pas trouver la row
    const result = await withSystemContext((tx) =>
      linkGuestCustomerToAuth(tx, { agencyId: agencyB, email, userId }),
    )

    assert.equal(result.linked, false)
    assert.equal(
      (result as { linked: false; skipped: string }).skipped,
      "no_guest_row",
      "row de agencyA invisible avec agencyB (isolation tenant)",
    )

    // Vérifier que le customer agencyA n'a pas été touché
    const [row] = await withSystemContext((tx) =>
      tx.select().from(customers).where(eq(customers.id, customerId)).limit(1),
    )
    assert.equal(
      row?.authUserId,
      null,
      "authUserId reste null — aucune modification cross-tenant",
    )
  } finally {
    await cleanupAgency(agencyA)
    await cleanupAgency(agencyB)
  }
})

/* -------------------------------------------------------------------------- */
/* T6 — Aucune row → { skipped: "no_guest_row" }                             */
/* -------------------------------------------------------------------------- */

test("WALLET-GUEST-INTEGRATION T6: linkGuestCustomerToAuth — aucune row → { skipped: 'no_guest_row' }", async (t) => {
  if (!dbAvailable) return t.skip(skip())

  const agencyId = await createTestAgency()
  const userId = randomUUID()

  try {
    const email = testEmail("t6-inexistant")
    // Aucune row insérée pour cet email

    const result = await withSystemContext((tx) =>
      linkGuestCustomerToAuth(tx, { agencyId, email, userId }),
    )

    assert.equal(result.linked, false)
    assert.equal(
      (result as { linked: false; skipped: string }).skipped,
      "no_guest_row",
    )
  } finally {
    await cleanupAgency(agencyId)
  }
})
