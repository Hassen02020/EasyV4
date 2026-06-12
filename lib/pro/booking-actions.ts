/**
 * Server Actions B2B — Validation finale du tunnel de réservation Pro.
 *
 * Sécurité comptable : toute opération qui touche le solde du compte de
 * dépôt d'une agence partenaire est protégée par un **verrouillage
 * pessimiste row-level** (`SELECT ... FOR UPDATE`) à l'intérieur d'une
 * transaction Drizzle. Cela garantit qu'aucune autre requête concurrente
 * ne peut lire/écrire la ligne `agencies` ni s'intercaler entre :
 *
 *   1. La vérification du solde disponible
 *   2. L'insertion du mouvement de débit (`partner_credit_movements`)
 *   3. La mise à jour du solde (`agencies.deposit_balance`)
 *
 * sans avoir attendu la fin de la transaction courante. Cela élimine
 * les race conditions de type "double-spending" sur le crédit B2B.
 *
 * Toutes les sommes sont stockées en `numeric(12, 3)` (millimes TND).
 */

import { eq } from "drizzle-orm"

import { getDb } from "@/lib/db/client"
import { getRedis } from "@/lib/cache/redis"
import { metrics } from "@/lib/observability/metrics"
import {
  agencies,
  partnerCreditMovements,
  type NewPartnerCreditMovement,
} from "@/lib/db/schema"

/* -------------------------------------------------------------------------- */
/* Types publics                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Interface minimale que doit implementer un client Drizzle (ou un mock)
 * pour la fonction `debitPartnerCredit`. On ne tape pas l'arbre Drizzle
 * complet pour rester découplable en tests.
 */
export type DrizzleLikeDb = {
  transaction: <T>(callback: (tx: DrizzleLikeTx) => Promise<T>) => Promise<T>
}

/** Sous-ensemble d'opérations utilisées à l'intérieur du verrou. */
export type DrizzleLikeTx = {
  select: (...args: unknown[]) => DrizzleLikeChain
  insert: (...args: unknown[]) => DrizzleLikeChain
  update: (...args: unknown[]) => DrizzleLikeChain
}

/**
 * Chaine fluide minimaliste utilisée par le service.
 *
 * Note : on ne déclare PAS `then` ici — la présence d'un `then?` optionnel
 * fait croire à TypeScript que l'objet est ambigûment un thenable et
 * empêche les `await` directs (TS1320). À la place, on caste explicitement
 * vers `Promise<unknown[]>` quand on a besoin d'exécuter la requête.
 */
export type DrizzleLikeChain = {
  from?: (...args: unknown[]) => DrizzleLikeChain
  where?: (...args: unknown[]) => DrizzleLikeChain
  for?: (
    strength: "update" | "share" | "no key update" | "key share",
    config?: unknown,
  ) => Promise<unknown[]>
  values?: (...args: unknown[]) => DrizzleLikeChain
  set?: (...args: unknown[]) => DrizzleLikeChain
  returning?: (...args: unknown[]) => Promise<unknown[]>
}

export type DebitPartnerCreditInput = {
  agencyId: string
  /**
   * Montant à débiter, en TND. **Toujours positif** côté API publique : le
   * signe négatif est appliqué par le service avant insertion.
   */
  amountTnd: number
  /** Référence externe (n° réservation `B2B-YYYYMMDD-XXXX`). */
  reference: string
  /** Description libre du mouvement (apparaît sur le relevé de compte). */
  description: string
  /** UUID de l'utilisateur partenaire qui valide la réservation. */
  createdByUserId?: string
  /** UUID optionnel de la réservation associée. */
  reservationId?: string
  /**
   * Clé d'idempotence UUID (ex: reservationId + "-debit").
   * Si fournie, un double appel avec la même clé retournera le résultat
   * original sans réexécuter le débit. TTL 24h dans Redis.
   */
  idempotencyKey?: string
  /**
   * Override du client Drizzle pour tests unitaires (mock). En production,
   * laisser `undefined` : on appelle `getDb()` automatiquement.
   */
  dbOverride?: DrizzleLikeDb
}

export type DebitPartnerCreditSuccess = {
  ok: true
  movementId: string
  balanceBefore: string
  balanceAfter: string
}

export type DebitPartnerCreditFailure = {
  ok: false
  /** Code machine pour permettre au client de reconnaître le cas d'erreur. */
  code:
    | "INVALID_AMOUNT"
    | "AGENCY_NOT_FOUND"
    | "INSUFFICIENT_FUNDS"
    | "DATABASE_NOT_CONFIGURED"
    | "INTERNAL_ERROR"
  message: string
  /** Détails contextuels (ex. solde courant en cas d'insuffisance). */
  details?: Record<string, string | number>
}

export type DebitPartnerCreditResult =
  | DebitPartnerCreditSuccess
  | DebitPartnerCreditFailure

/* -------------------------------------------------------------------------- */
/* Helpers (purs, testables)                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Convertit un nombre TND en chaîne `numeric(12, 3)` canonique avec
 * exactement 3 décimales. Postgres acceptera la chaîne directement.
 *
 *   formatTnd(1051.566)  → "1051.566"
 *   formatTnd(841.25)    → "841.250"
 *   formatTnd(-200)      → "-200.000"
 */
export function formatTnd(value: number): string {
  return value.toFixed(3)
}

/**
 * Parse une valeur `numeric(12, 3)` (toujours stringée par Postgres-js)
 * en nombre JS, en se protégeant des espaces et formats inattendus.
 */
export function parseTnd(value: string | number): number {
  if (typeof value === "number") return value
  return Number.parseFloat(value)
}

/**
 * Vérifie qu'un montant est valide pour un débit (positif, fini, et
 * arrondissable à 3 décimales sans perte significative).
 */
export function isValidDebitAmount(amount: number): boolean {
  if (!Number.isFinite(amount)) return false
  if (amount <= 0) return false
  // Au moins 1 millime
  if (amount < 0.001) return false
  return true
}

/* -------------------------------------------------------------------------- */
/* Server Action                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Débite atomiquement le compte de dépôt d'une agence partenaire et
 * crée le mouvement comptable associé.
 *
 * Comportement transactionnel :
 *   - `BEGIN` (implicite par `db.transaction`)
 *   - `SELECT id, deposit_balance FROM agencies WHERE id = $1 FOR UPDATE`
 *     → toute autre transaction tentant de lire cette ligne en `FOR UPDATE`
 *       (ou de la mettre à jour) attendra le `COMMIT`.
 *   - Vérification du solde ; en cas d'insuffisance → `ROLLBACK` (return
 *     `INSUFFICIENT_FUNDS`, aucun mouvement créé).
 *   - `INSERT INTO partner_credit_movements (amount=-X.XXX, balance_after=Y.YYY)`
 *   - `UPDATE agencies SET deposit_balance = Y.YYY WHERE id = $1`
 *   - `COMMIT`
 *
 * Tous les autres clients verront soit l'état initial, soit l'état final
 * complet (jamais un état intermédiaire).
 */
export async function debitPartnerCredit(
  input: DebitPartnerCreditInput,
): Promise<DebitPartnerCreditResult> {
  // Guard idempotence : si la clé a déjà été traitée, retourner le résultat cached
  if (input.idempotencyKey) {
    const redis = getRedis()
    if (redis) {
      const idemCacheKey = `e2b:idem:debit:${input.idempotencyKey}`
      const cached = await redis.get<string>(idemCacheKey)
      if (cached) {
        try { return JSON.parse(cached) as DebitPartnerCreditResult } catch { /* ignore */ }
      }
    }
  }

  if (!isValidDebitAmount(input.amountTnd)) {
    return {
      ok: false,
      code: "INVALID_AMOUNT",
      message:
        "Le montant à débiter doit être un nombre strictement positif (millime minimum 0.001 DT).",
    }
  }

  if (!process.env.DATABASE_URL) {
    return {
      ok: false,
      code: "DATABASE_NOT_CONFIGURED",
      message:
        "La base de données n'est pas configurée (DATABASE_URL absente). Le débit ne peut pas être appliqué.",
    }
  }

  const t0 = Date.now()

  try {
    const db = (input.dbOverride ?? getDb()) as DrizzleLikeDb
    return await db.transaction(async (tx) => {
      // ------------------------------------------------------------------
      // 1. Verrou pessimiste row-level sur l'agence partenaire.
      //
      // `.for("update")` génère `SELECT ... FOR UPDATE` côté Postgres :
      // toute autre transaction tentant un FOR UPDATE / UPDATE / DELETE
      // sur cette ligne attendra notre `COMMIT` ou `ROLLBACK`.
      // ------------------------------------------------------------------
      const selectChain = tx
        .select({
          id: agencies.id,
          depositBalance: agencies.depositBalance,
        })
        .from?.(agencies)
        .where?.(eq(agencies.id, input.agencyId))
      const lockedRows = (await selectChain?.for?.("update")) as Array<{
        id: string
        depositBalance: string
      }>

      const agency = lockedRows?.[0]
      if (!agency) {
        return {
          ok: false,
          code: "AGENCY_NOT_FOUND",
          message: `Aucune agence partenaire trouvée pour l'id "${input.agencyId}".`,
        } as DebitPartnerCreditFailure
      }

      // ------------------------------------------------------------------
      // 2. Vérification du solde disponible (en TND).
      // ------------------------------------------------------------------
      const currentBalance = parseTnd(agency.depositBalance)
      if (currentBalance < input.amountTnd) {
        return {
          ok: false,
          code: "INSUFFICIENT_FUNDS",
          message: `Solde insuffisant : disponible ${formatTnd(
            currentBalance,
          )} DT, demandé ${formatTnd(input.amountTnd)} DT.`,
          details: {
            availableTnd: formatTnd(currentBalance),
            requestedTnd: formatTnd(input.amountTnd),
          },
        } as DebitPartnerCreditFailure
      }

      // ------------------------------------------------------------------
      // 3. Calcul du nouveau solde et insertion du mouvement de débit.
      //
      // `amount` est stocké signé : négatif pour un débit comptable.
      // ------------------------------------------------------------------
      const newBalance = currentBalance - input.amountTnd
      const movementInsert: NewPartnerCreditMovement = {
        agencyId: input.agencyId,
        movementType: "debit",
        amount: formatTnd(-input.amountTnd),
        balanceAfter: formatTnd(newBalance),
        reference: input.reference,
        description: input.description,
        reservationId: input.reservationId,
        createdByUserId: input.createdByUserId,
      }

      const inserted = (await tx
        .insert(partnerCreditMovements)
        .values?.(movementInsert)
        .returning?.({ id: partnerCreditMovements.id })) as
        | Array<{ id: string }>
        | undefined

      const movementId = inserted?.[0]?.id
      if (!movementId) {
        // Très improbable (la table a un DEFAULT gen_random_uuid()), mais on
        // garde une garde explicite : la transaction sera annulée si on
        // throw, donc on lève pour que tout soit rollback.
        throw new Error(
          "L'insertion du mouvement de débit n'a pas retourné d'id.",
        )
      }

      // ------------------------------------------------------------------
      // 4. Mise à jour du solde de l'agence (même transaction).
      //
      // On cast explicitement en Promise<unknown> pour que TS accepte
      // le `await` sur la chaîne fluide (le `.where?.` ferme la requête
      // et la rend thenable côté Drizzle).
      // ------------------------------------------------------------------
      const updateChain = tx
        .update(agencies)
        .set?.({ depositBalance: formatTnd(newBalance) })
        .where?.(eq(agencies.id, input.agencyId))
      await (updateChain as unknown as Promise<unknown>)

      const successResult: DebitPartnerCreditSuccess = {
        ok: true,
        movementId,
        balanceBefore: formatTnd(currentBalance),
        balanceAfter: formatTnd(newBalance),
      }

      // Persister dans Redis pour l'idempotence (TTL 24h)
      if (input.idempotencyKey) {
        const redis = getRedis()
        if (redis) {
          await redis.set(
            `e2b:idem:debit:${input.idempotencyKey}`,
            JSON.stringify(successResult),
            { ex: 86_400 },
          )
        }
      }

      void metrics.timing("wallet.debit.latency_ms", Date.now() - t0)
      void metrics.slo("wallet.debit", true)
      void metrics.incr("wallet.debit.ok")
      return successResult
    })
  } catch (err) {
    void metrics.timing("wallet.debit.latency_ms", Date.now() - t0)
    void metrics.slo("wallet.debit", false)
    void metrics.incr("wallet.debit.error")
    return {
      ok: false,
      code: "INTERNAL_ERROR",
      message:
        err instanceof Error
          ? `Échec transactionnel : ${err.message}`
          : "Échec transactionnel inattendu.",
    }
  }
}
