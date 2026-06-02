/**
 * Tests unitaires — Server Action `debitPartnerCredit`.
 *
 * Objectif : valider que le verrouillage pessimiste + la transaction
 * atomique se comportent correctement sur tous les chemins (succès,
 * solde insuffisant, montant invalide, agence introuvable, BDD non
 * configurée, rollback sur erreur d'insertion).
 *
 * Stratégie : on injecte un faux client Drizzle (`dbOverride`) qui
 * tracke toutes les opérations effectuées dans la transaction afin
 * de vérifier l'ordre + la présence de `.for("update")`.
 */

import test from "node:test"
import assert from "node:assert/strict"

import {
  debitPartnerCredit,
  formatTnd,
  isValidDebitAmount,
  parseTnd,
  type DebitPartnerCreditResult,
  type DrizzleLikeDb,
} from "../booking-actions"

/* -------------------------------------------------------------------------- */
/* Helpers de test                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Journal des opérations effectuées dans la transaction mock.
 * Permet d'asserter l'ordre exact des appels (lock → check → insert → update).
 */
type OpKind =
  | "TX_BEGIN"
  | "SELECT_FOR_UPDATE"
  | "INSERT_MOVEMENT"
  | "UPDATE_BALANCE"
  | "TX_COMMIT"
  | "TX_ROLLBACK"

type OpEvent = { kind: OpKind; payload?: Record<string, unknown> }

type MockOptions = {
  /** Solde actuel renvoyé par le SELECT FOR UPDATE. */
  currentBalance: string | null
  /**
   * Si `null`, le SELECT FOR UPDATE renvoie zéro ligne (agence inconnue).
   * Si une chaîne, on renvoie une ligne {id, depositBalance}.
   */
  agencyExists: boolean
  /** Si défini, l'INSERT renverra un id (sinon, tableau vide → erreur). */
  insertReturnsId?: string | null
  /** Si défini, throw cette erreur dans le callback de transaction. */
  throwInTx?: Error
}

/**
 * Construit un faux `DrizzleLikeDb` qui :
 *   - log chaque opération dans `journal`,
 *   - simule un SELECT … FOR UPDATE,
 *   - simule un INSERT … RETURNING,
 *   - simule un UPDATE … SET … WHERE.
 */
function makeMockDb(opts: MockOptions): {
  db: DrizzleLikeDb
  journal: OpEvent[]
} {
  const journal: OpEvent[] = []

  const db: DrizzleLikeDb = {
    transaction: async <T>(
      callback: (tx: ReturnType<typeof makeTx>) => Promise<T>,
    ) => {
      journal.push({ kind: "TX_BEGIN" })
      try {
        const tx = makeTx()
        const out = await callback(tx)
        // Si le callback retourne {ok:false}, on considère que la transaction
        // est rollback (comme drizzle le ferait sur une erreur, mais ici on
        // simule le ROLLBACK de manière équivalente à un retour d'échec).
        if (
          typeof out === "object" &&
          out !== null &&
          "ok" in out &&
          (out as { ok: boolean }).ok === false
        ) {
          journal.push({ kind: "TX_ROLLBACK" })
        } else {
          journal.push({ kind: "TX_COMMIT" })
        }
        return out
      } catch (err) {
        journal.push({ kind: "TX_ROLLBACK" })
        throw err
      }
    },
  }

  function makeTx() {
    if (opts.throwInTx) {
      // throw immédiatement la première fois qu'on appelle select.
      return {
        select: () => {
          throw opts.throwInTx as Error
        },
        insert: () => ({}) as never,
        update: () => ({}) as never,
      }
    }

    return {
      select: () => ({
        from: () => ({
          where: () => ({
            for: async (strength: string) => {
              journal.push({
                kind: "SELECT_FOR_UPDATE",
                payload: { strength },
              })
              if (!opts.agencyExists) return []
              return [
                {
                  id: "agency-uuid-test",
                  depositBalance: opts.currentBalance,
                },
              ]
            },
          }),
        }),
      }),
      insert: () => ({
        values: (row: Record<string, unknown>) => ({
          returning: async () => {
            journal.push({
              kind: "INSERT_MOVEMENT",
              payload: row,
            })
            if (opts.insertReturnsId === null) return []
            return [{ id: opts.insertReturnsId ?? "movement-uuid-test" }]
          },
        }),
      }),
      update: () => ({
        set: (patch: Record<string, unknown>) => ({
          where: () => {
            journal.push({
              kind: "UPDATE_BALANCE",
              payload: patch,
            })
            // Retourne quelque chose d'awaitable
            return Promise.resolve(undefined)
          },
        }),
      }),
    }
  }

  return { db, journal }
}

/** Force DATABASE_URL pour les tests (sinon la fonction court-circuite). */
function ensureDatabaseUrl() {
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL =
      "postgresql://test:test@localhost:5432/test_only_for_mocks"
  }
}

/* -------------------------------------------------------------------------- */
/* Tests : helpers purs                                                       */
/* -------------------------------------------------------------------------- */

test("formatTnd : produit toujours 3 décimales", () => {
  assert.equal(formatTnd(1000), "1000.000")
  assert.equal(formatTnd(841.25), "841.250")
  assert.equal(formatTnd(841.253), "841.253")
  assert.equal(formatTnd(-200), "-200.000")
})

test("parseTnd : accepte string et number", () => {
  assert.equal(parseTnd("1000.000"), 1000)
  assert.equal(parseTnd("841.253"), 841.253)
  assert.equal(parseTnd(500), 500)
})

test("isValidDebitAmount : accepte > 0.001 et rejette le reste", () => {
  assert.equal(isValidDebitAmount(0), false)
  assert.equal(isValidDebitAmount(-1), false)
  assert.equal(isValidDebitAmount(0.0001), false)
  assert.equal(isValidDebitAmount(0.001), true)
  assert.equal(isValidDebitAmount(1000.123), true)
  assert.equal(isValidDebitAmount(Number.NaN), false)
  assert.equal(isValidDebitAmount(Number.POSITIVE_INFINITY), false)
})

/* -------------------------------------------------------------------------- */
/* Tests : Server Action — chemin nominal                                     */
/* -------------------------------------------------------------------------- */

test("debitPartnerCredit : succès débit avec solde suffisant", async () => {
  ensureDatabaseUrl()
  const { db, journal } = makeMockDb({
    currentBalance: "10000.000",
    agencyExists: true,
  })

  const result = (await debitPartnerCredit({
    agencyId: "agency-uuid-test",
    amountTnd: 1051.566,
    reference: "B2B-20260518-1328",
    description: "Réservation Carthage Thalasso",
    dbOverride: db,
  })) as DebitPartnerCreditResult

  assert.equal(result.ok, true, "Le résultat doit être un succès")
  if (result.ok) {
    assert.equal(result.balanceBefore, "10000.000")
    assert.equal(result.balanceAfter, "8948.434") // 10000 - 1051.566
    assert.equal(result.movementId, "movement-uuid-test")
  }

  // Ordre exact des opérations
  assert.deepEqual(
    journal.map((j) => j.kind),
    [
      "TX_BEGIN",
      "SELECT_FOR_UPDATE",
      "INSERT_MOVEMENT",
      "UPDATE_BALANCE",
      "TX_COMMIT",
    ],
  )

  // Le SELECT a bien utilisé le verrou "update"
  const lockOp = journal.find((j) => j.kind === "SELECT_FOR_UPDATE")
  assert.equal(lockOp?.payload?.strength, "update")

  // Le montant inséré est NÉGATIF (débit comptable)
  const insertOp = journal.find((j) => j.kind === "INSERT_MOVEMENT")
  assert.equal(insertOp?.payload?.amount, "-1051.566")
  assert.equal(insertOp?.payload?.balanceAfter, "8948.434")
  assert.equal(insertOp?.payload?.movementType, "debit")
})

/* -------------------------------------------------------------------------- */
/* Tests : Server Action — solde insuffisant                                  */
/* -------------------------------------------------------------------------- */

test("debitPartnerCredit : refuse si solde insuffisant (rollback)", async () => {
  ensureDatabaseUrl()
  const { db, journal } = makeMockDb({
    currentBalance: "500.000",
    agencyExists: true,
  })

  const result = await debitPartnerCredit({
    agencyId: "agency-uuid-test",
    amountTnd: 1051.566,
    reference: "B2B-20260518-1329",
    description: "Réservation refusée",
    dbOverride: db,
  })

  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.code, "INSUFFICIENT_FUNDS")
    assert.equal(result.details?.availableTnd, "500.000")
    assert.equal(result.details?.requestedTnd, "1051.566")
  }

  // AUCUN INSERT ni UPDATE ne doit avoir eu lieu
  assert.equal(
    journal.find((j) => j.kind === "INSERT_MOVEMENT"),
    undefined,
    "Aucun mouvement de débit ne doit être inséré quand le solde est insuffisant",
  )
  assert.equal(
    journal.find((j) => j.kind === "UPDATE_BALANCE"),
    undefined,
    "Le solde ne doit pas être mis à jour quand le débit est refusé",
  )

  // La transaction doit avoir été rollback (return ok:false)
  assert.equal(
    journal[journal.length - 1]?.kind,
    "TX_ROLLBACK",
    "La transaction doit être rollback",
  )
})

/* -------------------------------------------------------------------------- */
/* Tests : Server Action — montant invalide                                   */
/* -------------------------------------------------------------------------- */

test("debitPartnerCredit : refuse un montant invalide (court-circuit)", async () => {
  ensureDatabaseUrl()
  const { db, journal } = makeMockDb({
    currentBalance: "10000.000",
    agencyExists: true,
  })

  for (const bad of [0, -50, Number.NaN, Number.POSITIVE_INFINITY]) {
    const result = await debitPartnerCredit({
      agencyId: "agency-uuid-test",
      amountTnd: bad,
      reference: "B2B-INVALID",
      description: "test",
      dbOverride: db,
    })
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.code, "INVALID_AMOUNT")
    }
  }

  // La transaction ne doit JAMAIS avoir démarré
  assert.equal(
    journal.length,
    0,
    "Aucune transaction ne doit s'ouvrir pour un montant invalide",
  )
})

/* -------------------------------------------------------------------------- */
/* Tests : Server Action — agence introuvable                                 */
/* -------------------------------------------------------------------------- */

test("debitPartnerCredit : refuse si agence introuvable", async () => {
  ensureDatabaseUrl()
  const { db, journal } = makeMockDb({
    currentBalance: null,
    agencyExists: false,
  })

  const result = await debitPartnerCredit({
    agencyId: "agency-uuid-inexistante",
    amountTnd: 100,
    reference: "B2B-NOT-FOUND",
    description: "test",
    dbOverride: db,
  })

  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.code, "AGENCY_NOT_FOUND")
  }

  // Le SELECT FOR UPDATE a bien eu lieu (on a fait l'effort de verrouiller),
  // mais aucun INSERT/UPDATE.
  assert.ok(journal.some((j) => j.kind === "SELECT_FOR_UPDATE"))
  assert.equal(
    journal.find((j) => j.kind === "INSERT_MOVEMENT"),
    undefined,
  )
  assert.equal(
    journal.find((j) => j.kind === "UPDATE_BALANCE"),
    undefined,
  )
})

/* -------------------------------------------------------------------------- */
/* Tests : Server Action — DATABASE_URL absente                               */
/* -------------------------------------------------------------------------- */

test("debitPartnerCredit : refuse si DATABASE_URL n'est pas définie", async () => {
  const original = process.env.DATABASE_URL
  delete process.env.DATABASE_URL

  try {
    const { db, journal } = makeMockDb({
      currentBalance: "10000.000",
      agencyExists: true,
    })

    const result = await debitPartnerCredit({
      agencyId: "agency-uuid-test",
      amountTnd: 100,
      reference: "B2B-NO-DB",
      description: "test",
      dbOverride: db,
    })

    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.code, "DATABASE_NOT_CONFIGURED")
    }

    // Aucune opération ne doit avoir été tentée
    assert.equal(journal.length, 0)
  } finally {
    if (original !== undefined) {
      process.env.DATABASE_URL = original
    }
  }
})

/* -------------------------------------------------------------------------- */
/* Tests : Server Action — rollback sur erreur inattendue                     */
/* -------------------------------------------------------------------------- */

test("debitPartnerCredit : rollback transaction si exception interne", async () => {
  ensureDatabaseUrl()
  const { db, journal } = makeMockDb({
    currentBalance: "10000.000",
    agencyExists: true,
    throwInTx: new Error("Connexion BDD perdue"),
  })

  const result = await debitPartnerCredit({
    agencyId: "agency-uuid-test",
    amountTnd: 100,
    reference: "B2B-CRASH",
    description: "test",
    dbOverride: db,
  })

  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.code, "INTERNAL_ERROR")
    assert.match(result.message, /Connexion BDD perdue/)
  }

  // La transaction doit avoir été démarrée puis rollback
  assert.equal(journal[0]?.kind, "TX_BEGIN")
  assert.equal(journal[journal.length - 1]?.kind, "TX_ROLLBACK")
})

/* -------------------------------------------------------------------------- */
/* Tests : Server Action — précision millime (numeric(12,3))                  */
/* -------------------------------------------------------------------------- */

test("debitPartnerCredit : précision exacte à la 3e décimale (TND millime)", async () => {
  ensureDatabaseUrl()
  const { db, journal } = makeMockDb({
    currentBalance: "1000.000",
    agencyExists: true,
  })

  // 0.001 DT = 1 millime, le grain minimal du TND
  const result = await debitPartnerCredit({
    agencyId: "agency-uuid-test",
    amountTnd: 0.001,
    reference: "B2B-PRECISION",
    description: "test millime",
    dbOverride: db,
  })

  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.balanceBefore, "1000.000")
    assert.equal(result.balanceAfter, "999.999")
  }

  const insertOp = journal.find((j) => j.kind === "INSERT_MOVEMENT")
  // Le montant signé doit être un négatif strict avec 3 décimales
  assert.equal(insertOp?.payload?.amount, "-0.001")
})
