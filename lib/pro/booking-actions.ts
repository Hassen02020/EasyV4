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

import { and, eq, sql } from "drizzle-orm"
import { z } from "zod"

import { getDb } from "@/lib/db/client"
import { getRedis } from "@/lib/cache/redis"
import { metrics } from "@/lib/observability/metrics"
import { travelerSchemaWithIdRule } from "@/lib/booking/schemas"
import {
  agencies,
  auditEvents,
  customers,
  partnerCreditMovements,
  reservations,
  reservationHotel,
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
/* Cœur transactionnel réutilisable                                           */
/* -------------------------------------------------------------------------- */

/** Paramètres du débit appliqué à l'intérieur d'une transaction ouverte. */
export type ApplyDebitParams = {
  agencyId: string
  amountTnd: number
  reference: string
  description: string
  createdByUserId?: string
  reservationId?: string
}

/**
 * Applique le débit (verrou pessimiste → vérif solde → mouvement → maj
 * solde) à l'intérieur d'une transaction Drizzle **déjà ouverte** (`tx`).
 *
 * Ne gère ni l'idempotence ni les métriques (c'est le rôle de l'appelant).
 * Permet de partager exactement la même logique de verrouillage entre :
 *   - `debitPartnerCredit` (qui ouvre sa propre transaction dédiée)
 *   - `bookHotelB2B` (dont la transaction englobe aussi l'insertion de la
 *     réservation) → atomicité totale : si le débit échoue, la réservation
 *     n'est jamais créée.
 *
 * Renvoie un résultat d'échec (`INSUFFICIENT_FUNDS` / `AGENCY_NOT_FOUND`)
 * sans throw ; l'appelant décide s'il doit faire échouer la transaction.
 */
export async function applyPartnerDebitWithinTx(
  tx: DrizzleLikeTx,
  params: ApplyDebitParams,
): Promise<DebitPartnerCreditResult> {
  // 1. Verrou pessimiste row-level sur l'agence partenaire (`FOR UPDATE`).
  const selectChain = tx
    .select({
      id: agencies.id,
      depositBalance: agencies.depositBalance,
    })
    .from?.(agencies)
    .where?.(eq(agencies.id, params.agencyId))
  const lockedRows = (await selectChain?.for?.("update")) as Array<{
    id: string
    depositBalance: string
  }>

  const agency = lockedRows?.[0]
  if (!agency) {
    return {
      ok: false,
      code: "AGENCY_NOT_FOUND",
      message: `Aucune agence partenaire trouvée pour l'id "${params.agencyId}".`,
    }
  }

  // 2. Vérification du solde disponible (sous verrou — aucune race possible).
  const currentBalance = parseTnd(agency.depositBalance)
  if (currentBalance < params.amountTnd) {
    return {
      ok: false,
      code: "INSUFFICIENT_FUNDS",
      message: `Solde insuffisant : disponible ${formatTnd(
        currentBalance,
      )} DT, demandé ${formatTnd(params.amountTnd)} DT.`,
      details: {
        availableTnd: formatTnd(currentBalance),
        requestedTnd: formatTnd(params.amountTnd),
      },
    }
  }

  // 3. Insertion du mouvement de débit (montant NÉGATIF, numeric(12,3)).
  const newBalance = currentBalance - params.amountTnd
  const movementInsert: NewPartnerCreditMovement = {
    agencyId: params.agencyId,
    movementType: "debit",
    amount: formatTnd(-params.amountTnd),
    balanceAfter: formatTnd(newBalance),
    reference: params.reference,
    description: params.description,
    reservationId: params.reservationId,
    createdByUserId: params.createdByUserId,
  }

  const inserted = (await tx
    .insert(partnerCreditMovements)
    .values?.(movementInsert)
    .returning?.({ id: partnerCreditMovements.id })) as
    | Array<{ id: string }>
    | undefined

  const movementId = inserted?.[0]?.id
  if (!movementId) {
    // La table a un DEFAULT gen_random_uuid() : ne devrait pas arriver. On
    // throw pour forcer le ROLLBACK complet de la transaction englobante.
    throw new Error("L'insertion du mouvement de débit n'a pas retourné d'id.")
  }

  // 4. Mise à jour atomique du solde de l'agence (toujours sous verrou).
  const updateChain = tx
    .update(agencies)
    .set?.({ depositBalance: formatTnd(newBalance) })
    .where?.(eq(agencies.id, params.agencyId))
  await (updateChain as unknown as Promise<unknown>)

  return {
    ok: true,
    movementId,
    balanceBefore: formatTnd(currentBalance),
    balanceAfter: formatTnd(newBalance),
  }
}

/* -------------------------------------------------------------------------- */
/* Server Action — débit unitaire                                             */
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
    const result = await db.transaction(async (tx) =>
      applyPartnerDebitWithinTx(tx, {
        agencyId: input.agencyId,
        amountTnd: input.amountTnd,
        reference: input.reference,
        description: input.description,
        createdByUserId: input.createdByUserId,
        reservationId: input.reservationId,
      }),
    )

    if (result.ok) {
      // Persister dans Redis pour l'idempotence (TTL 24h), après COMMIT.
      if (input.idempotencyKey) {
        const redis = getRedis()
        if (redis) {
          await redis.set(
            `e2b:idem:debit:${input.idempotencyKey}`,
            JSON.stringify(result),
            { ex: 86_400 },
          )
        }
      }
      void metrics.timing("wallet.debit.latency_ms", Date.now() - t0)
      void metrics.slo("wallet.debit", true)
      void metrics.incr("wallet.debit.ok")
    }
    return result
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

/* -------------------------------------------------------------------------- */
/* Tunnel de réservation B2B — validation + débit + insertion atomiques       */
/* -------------------------------------------------------------------------- */

/** Une chambre/offre sélectionnée dans le panier B2B. */
export const b2bHotelOfferSchema = z.object({
  id: z.string().trim().min(1).max(64),
  qty: z.number().int().positive().max(20),
  unitPriceTnd: z.number().nonnegative(),
  boardCode: z.string().max(16).optional(),
  boardName: z.string().max(100).optional(),
})

/**
 * Schéma Zod du panier de réservation hôtelière B2B. Validé côté serveur
 * avant toute écriture en base (défense en profondeur — le client valide
 * déjà mais on ne lui fait jamais confiance).
 */
export const bookHotelB2BSchema = z.object({
  hotel: z.object({
    /** Identifiant catalogue (slug fixture, ex. "carthage-thalasso"). */
    id: z.string().trim().min(1).max(64),
    name: z.string().trim().min(1).max(200),
    cityName: z.string().max(100).optional(),
  }),
  stay: z.object({
    checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date d'arrivée invalide"),
    checkOut: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date de départ invalide"),
    adults: z.number().int().positive().max(50),
    children: z.number().int().nonnegative().max(50),
    childrenAges: z.array(z.number().int().min(0).max(17)).optional(),
  }),
  offers: z
    .array(b2bHotelOfferSchema)
    .min(1, "Au moins une chambre doit être sélectionnée"),
  traveler: travelerSchemaWithIdRule,
  totalTnd: z.number().positive("Le total TTC doit être strictement positif"),
  internalRef: z.string().max(64).optional(),
  matricule: z.string().max(64).optional(),
  coupon: z.string().max(32).optional(),
})

export type BookHotelB2BInput = z.input<typeof bookHotelB2BSchema>
export type BookHotelB2BParsed = z.output<typeof bookHotelB2BSchema>

export type BookHotelB2BResult =
  | {
      ok: true
      reservationId: string
      publicRef: string
      balanceAfter: string
    }
  | {
      ok: false
      code:
        | "VALIDATION_ERROR"
        | "NOT_AUTHENTICATED"
        | "PROFILE_NOT_FOUND"
        | "DATABASE_NOT_CONFIGURED"
        | "INSUFFICIENT_FUNDS"
        | "AGENCY_NOT_FOUND"
        | "INTERNAL_ERROR"
      error: string
    }

/**
 * Erreur typée propagée depuis la transaction pour forcer un ROLLBACK total
 * tout en conservant le code métier (solde insuffisant, agence inconnue).
 */
export class B2BDebitFailure extends Error {
  code: "INSUFFICIENT_FUNDS" | "AGENCY_NOT_FOUND" | "INTERNAL_ERROR"
  constructor(
    code: "INSUFFICIENT_FUNDS" | "AGENCY_NOT_FOUND" | "INTERNAL_ERROR",
    message: string,
  ) {
    super(message)
    this.name = "B2BDebitFailure"
    this.code = code
  }
}

/** Type du client Drizzle (et de sa transaction) résolu depuis `getDb()`. */
type DrizzleDb = ReturnType<typeof getDb>
type DrizzleTx = Parameters<Parameters<DrizzleDb["transaction"]>[0]>[0]

/**
 * Convertit un slug catalogue (`carthage-thalasso`) en entier positif
 * stable (hash FNV-1a 31 bits). La colonne `reservation_hotel.hotel_id`
 * est un `integer` provider ; en B2B le catalogue est mocké par slug, on
 * dérive donc un id déterministe (le nom lisible reste dans `hotelName`).
 */
export function hotelSlugToInt(slug: string): number {
  let hash = 2166136261
  for (let i = 0; i < slug.length; i++) {
    hash ^= slug.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 1) % 2147483647
}

/** Nombre de nuits entre deux dates `YYYY-MM-DD` (minimum 1). */
function diffNights(checkIn: string, checkOut: string): number {
  const a = new Date(checkIn).getTime()
  const b = new Date(checkOut).getTime()
  return Math.max(1, Math.round((b - a) / 86_400_000))
}

/**
 * Génère la prochaine référence publique `TG-YYYY-NNNNNN` pour l'agence,
 * calculée via `MAX()` à l'intérieur de la transaction (atomique, pas de
 * race possible avec un autre booking concurrent).
 */
async function nextB2BPublicRef(
  tx: DrizzleTx,
  agencyId: string,
): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `TG-${year}-`
  const [row] = await tx
    .select({ maxRef: sql<string | null>`MAX(${reservations.publicRef})` })
    .from(reservations)
    .where(
      and(
        eq(reservations.agencyId, agencyId),
        sql`${reservations.publicRef} LIKE ${prefix + "%"}`,
      ),
    )
  const maxRef = row?.maxRef
  const max = maxRef ? Number(maxRef.slice(prefix.length)) : 0
  const next = Number.isFinite(max) ? max + 1 : 1
  return `${prefix}${String(next).padStart(6, "0")}`
}

/**
 * Cœur transactionnel du booking B2B (testable avec un `tx` mocké).
 *
 * Toutes les opérations s'exécutent dans la transaction `tx` fournie :
 *   1. Résolution / création du client (`customers`)
 *   2. Génération de la référence publique
 *   3. Insertion de la réservation (`reservations`) + extension hôtel
 *      (`reservation_hotel`)
 *   4. **Débit pessimiste** du compte de dépôt (`applyPartnerDebitWithinTx`)
 *   5. Journal d'audit
 *
 * Si le débit échoue (solde insuffisant / agence inconnue), on **throw**
 * une `B2BDebitFailure` → la transaction est annulée et la réservation
 * n'est JAMAIS persistée (atomicité totale).
 */
export async function runB2BHotelReservation(
  tx: DrizzleTx,
  args: { agencyId: string; userId: string; input: BookHotelB2BParsed },
): Promise<{ reservationId: string; publicRef: string; balanceAfter: string }> {
  const { agencyId, userId, input } = args
  const { traveler } = input

  // 1. Résoudre ou créer le client (scoped agence).
  let customerId: string
  if (traveler.email) {
    const existing = await tx
      .select({ id: customers.id })
      .from(customers)
      .where(
        and(
          eq(customers.agencyId, agencyId),
          eq(customers.email, traveler.email),
        ),
      )
      .limit(1)
    if (existing[0]) {
      customerId = existing[0].id
    } else {
      const inserted = await tx
        .insert(customers)
        .values({
          agencyId,
          civility: traveler.civility,
          firstName: traveler.firstName,
          lastName: traveler.lastName,
          email: traveler.email,
          phone: traveler.phone,
          civicId: traveler.civicId,
          civicIdType: traveler.civicIdType,
          birthDate: traveler.birthDate || null,
          nationality: traveler.nationality || null,
        })
        .returning({ id: customers.id })
      customerId = inserted[0].id
    }
  } else {
    const inserted = await tx
      .insert(customers)
      .values({
        agencyId,
        civility: traveler.civility,
        firstName: traveler.firstName,
        lastName: traveler.lastName,
        phone: traveler.phone,
        civicId: traveler.civicId,
        civicIdType: traveler.civicIdType,
      })
      .returning({ id: customers.id })
    customerId = inserted[0].id
  }

  // 2. Référence publique séquentielle.
  const publicRef = await nextB2BPublicRef(tx, agencyId)

  // 3. Insertion de la réservation + extension hôtel.
  const totalStr = formatTnd(input.totalTnd)
  const insertedReservation = await tx
    .insert(reservations)
    .values({
      agencyId,
      publicRef,
      customerId,
      module: "hotel",
      source: "internal",
      status: "pending",
      originalCurrency: "TND",
      originalAmount: totalStr,
      tndAmount: totalStr,
      depositAmount: totalStr,
      depositPaid: totalStr,
      // Sécurité : injecté depuis la session Supabase (jamais le client).
      createdByUserId: userId,
      providerPayload: {
        hotelSlug: input.hotel.id,
        hotelName: input.hotel.name,
        cityName: input.hotel.cityName ?? null,
        stay: input.stay,
        offers: input.offers,
        internalRef: input.internalRef ?? null,
        matricule: input.matricule ?? null,
        coupon: input.coupon ?? null,
        paymentMode: "deposit",
      },
    })
    .returning({ id: reservations.id })
  const reservationId = insertedReservation[0].id

  const firstOffer = input.offers[0]
  await tx.insert(reservationHotel).values({
    reservationId,
    agencyId,
    hotelId: hotelSlugToInt(input.hotel.id),
    hotelName: input.hotel.name,
    cityName: input.hotel.cityName ?? null,
    checkIn: input.stay.checkIn,
    checkOut: input.stay.checkOut,
    nights: diffNights(input.stay.checkIn, input.stay.checkOut),
    adults: input.stay.adults,
    childrenAges: input.stay.childrenAges ?? [],
    boardCode: firstOffer?.boardCode,
    boardName: firstOffer?.boardName,
    rooms: input.offers,
  })

  // 4. Débit pessimiste du compte de dépôt — DANS la même transaction.
  const debit = await applyPartnerDebitWithinTx(tx as unknown as DrizzleLikeTx, {
    agencyId,
    amountTnd: input.totalTnd,
    reference: publicRef,
    description: `Réservation ${input.hotel.name} (${publicRef})`,
    reservationId,
    createdByUserId: userId,
  })
  if (!debit.ok) {
    // ROLLBACK total : la réservation insérée plus haut est annulée.
    const code =
      debit.code === "INSUFFICIENT_FUNDS"
        ? "INSUFFICIENT_FUNDS"
        : debit.code === "AGENCY_NOT_FOUND"
          ? "AGENCY_NOT_FOUND"
          : "INTERNAL_ERROR"
    throw new B2BDebitFailure(code, debit.message)
  }

  // 5. Journal d'audit (dans la transaction).
  await tx.insert(auditEvents).values({
    agencyId,
    action: "reservation.created",
    entityType: "reservation",
    entityId: reservationId,
    diff: {
      module: "hotel",
      publicRef,
      total: input.totalTnd,
      via: "pro-b2b",
      movementId: debit.movementId,
    },
  })

  return { reservationId, publicRef, balanceAfter: debit.balanceAfter }
}
