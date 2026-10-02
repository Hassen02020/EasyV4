/**
 * R6-01-DB-CONSTRAINT — preuve live (Postgres réel) que le trigger
 * `reservation_status_transition_guard` (drizzle/manual/
 * 0090_reservation_status_transition_guard.sql) est le MIROIR EXACT de
 * `ALLOWED_TRANSITIONS` (lib/admin/reservation-status.ts) : pour les 56
 * paires (FROM, TO) possibles (8 statuts × 7 cibles distinctes), un UPDATE
 * direct sur `reservations.status` — en contournant totalement
 * `isTransitionAllowed()`/`recordReservationTransition()` — est accepté
 * par Postgres SI ET SEULEMENT SI `isTransitionAllowed(FROM, TO)` est vrai.
 *
 * Chaque paire s'exécute dans sa propre sous-transaction (SAVEPOINT) : un
 * rejet attendu n'invalide jamais les paires suivantes. Une ligne fraîche
 * est créée par paire (status initial posé par INSERT direct — le trigger
 * ne porte que sur UPDATE, voir le commentaire de tête de la migration).
 *
 * Même convention que les autres suites live : se dégrade en `skip` sans
 * DATABASE_URL/Postgres local disponible.
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import {
  withSystemContext,
  withTenantContext,
  type TenantContext,
} from "@/lib/db/tenant-context"
import { agencies, customers, reservations } from "@/lib/db/schema"
import {
  RESERVATION_STATUSES,
  isTransitionAllowed,
  type ReservationStatus,
} from "../reservation-status"

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
let customerId = ""

before(async () => {
  dbAvailable = await isDbAvailable()
  if (!dbAvailable) return

  agencyId = randomUUID()
  customerId = randomUUID()

  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values({
      id: agencyId,
      name: "R6-01-DB-CONSTRAINT Agency",
      agencyType: "partner",
      slug: `r6-01-db-constraint-${agencyId.slice(0, 8)}`,
    })
    await tx.insert(customers).values({
      id: customerId,
      agencyId,
      firstName: "Test",
      lastName: "R601DbConstraint",
    })
  })
})

after(async () => {
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    await tx.delete(reservations).where(eq(reservations.agencyId, agencyId))
    await tx.delete(customers).where(eq(customers.id, customerId))
    await tx.delete(agencies).where(eq(agencies.id, agencyId))
  })
})

test("trigger reservation_status_transition_guard : miroir exact de isTransitionAllowed() sur les 56 paires (FROM, TO) possibles", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())

  const ctx: TenantContext = {
    agencyId,
    userId: randomUUID(),
    isSuperAdmin: false,
  }

  await withTenantContext(ctx, async (tx) => {
    for (const from of RESERVATION_STATUSES) {
      for (const to of RESERVATION_STATUSES) {
        if (from === to) continue
        const expectedAllowed = isTransitionAllowed(from, to)

        // INSERT direct (status initial posé sans passer par une
        // transition — le trigger ne porte que sur UPDATE) dans une
        // sous-transaction (SAVEPOINT) dédiée par paire. IMPORTANT : le
        // rejet attendu doit se propager HORS du callback `tx.transaction`
        // pour que le driver émette lui-même `ROLLBACK TO SAVEPOINT` —
        // l'attraper À L'INTÉRIEUR du callback laisserait la sous-
        // transaction dans un état "aborted" côté Postgres (toute requête
        // suivante, y compris un simple `RELEASE SAVEPOINT` implicite,
        // échouerait avec "current transaction is aborted"). D'où
        // `assert.rejects` posé sur l'appel à `tx.transaction(...)`
        // lui-même, jamais sur l'`UPDATE` interne.
        const runPair = () =>
          tx.transaction(async (tx2) => {
            const [row] = await tx2
              .insert(reservations)
              .values({
                agencyId,
                publicRef: `R601-${from}-${to}-${randomUUID().slice(0, 6)}`,
                customerId,
                module: "hotel",
                source: "internal",
                status: from as ReservationStatus,
                originalCurrency: "TND",
                originalAmount: "100.00",
                tndAmount: "100.00",
              })
              .returning({ id: reservations.id })

            await tx2
              .update(reservations)
              .set({ status: to })
              .where(eq(reservations.id, row!.id))

            const [after] = await tx2
              .select({ status: reservations.status })
              .from(reservations)
              .where(eq(reservations.id, row!.id))
            return after!.status
          })

        if (expectedAllowed) {
          const finalStatus = await runPair()
          assert.equal(
            finalStatus,
            to,
            `${from} -> ${to} devait être ACCEPTÉE par le trigger (isTransitionAllowed=true)`,
          )
        } else {
          await assert.rejects(runPair, (err: unknown) => {
            const message =
              err instanceof Error && err.cause instanceof Error
                ? err.cause.message
                : ""
            assert.match(
              message,
              /reservation_status_transition_invalid/,
              `${from} -> ${to} devait être REJETÉE par le trigger (isTransitionAllowed=false), message reçu: "${message}"`,
            )
            return true
          })
        }
      }
    }
  })
})
