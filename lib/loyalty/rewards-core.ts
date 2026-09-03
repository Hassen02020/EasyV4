/**
 * Easy2Book Rewards (Loyalty V1) — moteur central, PAS un fichier
 * `"use server"`.
 *
 * PHASE 38D. Suit exactement la leçon de la Phase 38A (hardening) : toute
 * fonction exportée d'un fichier `"use server"` devient un Server Action
 * Next.js candidat à une invocation indépendante — vérifié en Phase 38A via
 * le manifeste de build réel. Ce fichier ne prend jamais de session
 * Supabase en paramètre implicite : chaque fonction reçoit `agencyId`/
 * `customerId` déjà résolus par l'appelant (même pattern que
 * lib/booking/customer-identity.ts, lib/booking/policy-cancel-core.ts,
 * lib/admin/cancellation-policy-core.ts) — testable directement contre une
 * vraie transaction DB, jamais exposé comme action indépendante.
 *
 * CONTRATS (Phase 38C, voir rapport) :
 *  - Consommation réservation : `reservations.status === "completed"` (déjà
 *    existant, déjà utilisé ailleurs comme signal "séjour réellement
 *    effectué" — voir lib/pro/voucher-eligibility.ts) — jamais un nouveau
 *    statut inventé. `updateReservationStatus` (lib/admin/actions.ts) reste
 *    le SEUL point d'écriture de cette transition (staff only) — ce module
 *    s'y accroche dans la MÊME transaction, jamais une seconde logique de
 *    détection.
 *  - Montant commercial éligible : `getReservationPaymentSummary().collectedTnd`
 *    (déjà existant, déjà autoritaire, toujours recalculé net de tout
 *    remboursement déjà appliqué — lib/finance/payment-summary.ts) —
 *    jamais `reservations.tndAmount` seul (brut, non net des
 *    remboursements), jamais un prix d'affichage front-end.
 *
 * FRONTIÈRES EXPLICITES (mandat Phase 38D) :
 *  - Jamais de fusion avec le Wallet : `creditCustomerWallet` reste
 *    documenté "remboursement authentique uniquement" — jamais réutilisé
 *    ici. Les points ne sont ni de l'argent, ni transférables, ni
 *    encaissables.
 *  - La rédemption (`redeemPoints`) est un mouvement de GRAND LIVRE
 *    uniquement : elle valide les limites, décrémente le solde disponible,
 *    trace l'événement, et renvoie l'équivalent TND informatif — elle ne
 *    modifie JAMAIS `reservations.tndAmount`/`payments`/le montant
 *    réellement facturé (aucune nouvelle valeur d'enum `payment_method`,
 *    aucun contournement de `getReservationPaymentSummary`). Relier cette
 *    rédemption à une réduction réelle du montant encaissé au checkout est
 *    une intégration Paiement/Pricing future, explicitement HORS PÉRIMÈTRE
 *    V1 (même discipline que "remboursement PSP monétaire = NON
 *    IMPLÉMENTÉ" dans le Policy Engine — un manque assumé, pas un manque
 *    silencieux).
 */

import { and, eq, sql } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import { loyaltyAccounts, loyaltyLedger } from "@/lib/db/schema"

/* -------------------------------------------------------------------------- */
/* Règles métier V1 — constantes explicites, jamais un nombre magique inline */
/* -------------------------------------------------------------------------- */

/** 1 TND éligible dépensé = 1 point (arrondi à l'entier inférieur — jamais de point fractionnaire inventé). */
export const POINTS_PER_ELIGIBLE_TND = 1
/** 100 points = 1 TND — utilisé UNIQUEMENT pour calculer le plafond de rédemption, jamais pour créditer un montant réel. */
export const POINTS_TO_TND_RATE = 100
export const MIN_REDEMPTION_POINTS = 1000
export const MAX_REDEMPTION_FRACTION_OF_ELIGIBLE = 0.1
/** Omra exclu par défaut (mandat explicite) — jamais un choix déduit du code. */
export const LOYALTY_ELIGIBLE_MODULES = ["hotel", "package", "activity"] as const
export type LoyaltyEligibleModule = (typeof LOYALTY_ELIGIBLE_MODULES)[number]
export const INACTIVITY_EXPIRY_MONTHS = 24

export function isLoyaltyEligibleModule(module: string): module is LoyaltyEligibleModule {
  return (LOYALTY_ELIGIBLE_MODULES as readonly string[]).includes(module)
}

/** Points gagnés pour un montant TND éligible donné — jamais négatif, jamais fractionnaire. */
export function computeEarnedPoints(eligibleTnd: number): number {
  if (!Number.isFinite(eligibleTnd) || eligibleTnd <= 0) return 0
  return Math.floor(eligibleTnd * POINTS_PER_ELIGIBLE_TND)
}

/** Plafond de rédemption pour une réservation dont le montant TND éligible est `eligibleTnd`. */
export function computeMaxRedeemablePoints(eligibleTnd: number): number {
  if (!Number.isFinite(eligibleTnd) || eligibleTnd <= 0) return 0
  return Math.floor(eligibleTnd * MAX_REDEMPTION_FRACTION_OF_ELIGIBLE * POINTS_TO_TND_RATE)
}

/** Équivalent TND informatif d'un nombre de points (jamais utilisé pour créditer un montant réel — voir doc de tête). */
export function pointsToTndEquivalent(points: number): number {
  return points / POINTS_TO_TND_RATE
}

/** Un compte est expiré par inactivité si sa dernière activité date de plus de 24 mois. Pure, testable sans horloge système. */
export function isExpiredByInactivity(lastActivityAt: Date, now: Date): boolean {
  const cutoff = new Date(now)
  cutoff.setMonth(cutoff.getMonth() - INACTIVITY_EXPIRY_MONTHS)
  return lastActivityAt.getTime() < cutoff.getTime()
}

/* -------------------------------------------------------------------------- */
/* Compte — verrouillage + création paresseuse, même pattern que             */
/* lib/finance/customer-wallet.ts::lockOrCreateCustomerWallet (FOR UPDATE    */
/* avant toute lecture de solde, garantit la sérialisation des mutations     */
/* concurrentes sur LE MÊME compte).                                        */
/* -------------------------------------------------------------------------- */

export interface LoyaltyAccountRow {
  id: string
  agencyId: string
  customerId: string
  pendingPoints: number
  availablePoints: number
  lifetimeEarnedPoints: number
  lifetimeRedeemedPoints: number
  lastActivityAt: Date
}

export async function lockOrCreateLoyaltyAccount(
  tx: DrizzleTransaction,
  params: { agencyId: string; customerId: string },
): Promise<LoyaltyAccountRow> {
  const { agencyId, customerId } = params

  const [locked] = await tx
    .select()
    .from(loyaltyAccounts)
    .where(eq(loyaltyAccounts.customerId, customerId))
    .for("update")
  if (locked) return locked

  const [inserted] = await tx
    .insert(loyaltyAccounts)
    .values({ agencyId, customerId })
    .returning()
  if (!inserted) throw new Error("La création du compte Easy2Book Rewards n'a pas retourné de ligne.")
  return inserted
}

/** Lecture seule — pour l'affichage `/compte`, ne verrouille rien. */
export async function getLoyaltyAccountSummary(
  tx: DrizzleTransaction,
  customerId: string,
): Promise<LoyaltyAccountRow | null> {
  const [row] = await tx.select().from(loyaltyAccounts).where(eq(loyaltyAccounts.customerId, customerId)).limit(1)
  return row ?? null
}

/* -------------------------------------------------------------------------- */
/* Aide interne : somme des mouvements d'un bucket pour une réservation      */
/* précise sur CE compte — reconstruit le solde net "encore attribuable à    */
/* cette réservation" sans dépendre d'un compteur séparé par réservation,    */
/* en interrogeant directement le grand livre (source de vérité unique).    */
/* -------------------------------------------------------------------------- */

async function sumLedgerForReservation(
  tx: DrizzleTransaction,
  params: { loyaltyAccountId: string; reservationId: string; bucket: "pending" | "available"; types?: string[] },
): Promise<number> {
  const conditions = [
    eq(loyaltyLedger.loyaltyAccountId, params.loyaltyAccountId),
    eq(loyaltyLedger.reservationId, params.reservationId),
    eq(loyaltyLedger.bucket, params.bucket),
  ]
  const rows = await tx
    .select({ points: loyaltyLedger.points, type: loyaltyLedger.type })
    .from(loyaltyLedger)
    .where(and(...conditions))
  const filtered = params.types ? rows.filter((r) => params.types!.includes(r.type)) : rows
  return filtered.reduce((sum, r) => sum + r.points, 0)
}

async function findLedgerByIdempotencyKey(
  tx: DrizzleTransaction,
  idempotencyKey: string,
): Promise<{ id: string } | null> {
  const [row] = await tx
    .select({ id: loyaltyLedger.id })
    .from(loyaltyLedger)
    .where(eq(loyaltyLedger.idempotencyKey, idempotencyKey))
    .limit(1)
  return row ?? null
}

async function insertLedgerRow(
  tx: DrizzleTransaction,
  row: {
    agencyId: string
    loyaltyAccountId: string
    customerId: string
    type: string
    bucket: "pending" | "available"
    points: number
    balanceBefore: number
    balanceAfter: number
    reservationId?: string | null
    description: string
    metadata?: Record<string, unknown>
    idempotencyKey?: string | null
    createdByUserId?: string | null
  },
): Promise<void> {
  await tx.insert(loyaltyLedger).values(row)
}

/* -------------------------------------------------------------------------- */
/* 1. EARN — points PENDING à la confirmation d'une réservation éligible.    */
/* -------------------------------------------------------------------------- */

export type EarnPendingPointsResult =
  | { ok: true; awarded: boolean; points: number; loyaltyAccountId: string }
  | { ok: false; error: string; code: "NOT_ELIGIBLE" | "NOTHING_TO_EARN" }

export async function earnPendingPoints(
  tx: DrizzleTransaction,
  params: {
    agencyId: string
    customerId: string
    reservationId: string
    module: string
    eligibleTnd: number
    idempotencyKey: string
    actorUserId?: string
  },
): Promise<EarnPendingPointsResult> {
  if (!isLoyaltyEligibleModule(params.module)) {
    return { ok: false, error: "Module non éligible au programme de fidélité.", code: "NOT_ELIGIBLE" }
  }
  const points = computeEarnedPoints(params.eligibleTnd)
  if (points <= 0) {
    return { ok: false, error: "Aucun point à attribuer pour ce montant.", code: "NOTHING_TO_EARN" }
  }

  const existing = await findLedgerByIdempotencyKey(tx, params.idempotencyKey)
  if (existing) {
    const account = await lockOrCreateLoyaltyAccount(tx, { agencyId: params.agencyId, customerId: params.customerId })
    return { ok: true, awarded: false, points, loyaltyAccountId: account.id }
  }

  const account = await lockOrCreateLoyaltyAccount(tx, { agencyId: params.agencyId, customerId: params.customerId })
  const balanceBefore = account.pendingPoints
  const balanceAfter = balanceBefore + points

  await insertLedgerRow(tx, {
    agencyId: params.agencyId,
    loyaltyAccountId: account.id,
    customerId: params.customerId,
    type: "earn_pending",
    bucket: "pending",
    points,
    balanceBefore,
    balanceAfter,
    reservationId: params.reservationId,
    description: `Points en attente — réservation ${params.reservationId}`,
    idempotencyKey: params.idempotencyKey,
    createdByUserId: params.actorUserId ?? null,
  })

  await tx
    .update(loyaltyAccounts)
    .set({
      pendingPoints: balanceAfter,
      lifetimeEarnedPoints: account.lifetimeEarnedPoints + points,
      lastActivityAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(loyaltyAccounts.id, account.id))

  return { ok: true, awarded: true, points, loyaltyAccountId: account.id }
}

/* -------------------------------------------------------------------------- */
/* 2. CONVERT — pending → available à la complétion validée de la           */
/*    réservation (reservations.status === "completed").                     */
/* -------------------------------------------------------------------------- */

export type ConvertPendingToAvailableResult =
  | { ok: true; converted: boolean; points: number }
  | { ok: false; error: string; code: "NOTHING_PENDING" }

export async function convertPendingToAvailable(
  tx: DrizzleTransaction,
  params: { agencyId: string; customerId: string; reservationId: string; idempotencyKey: string; actorUserId?: string },
): Promise<ConvertPendingToAvailableResult> {
  const existing = await findLedgerByIdempotencyKey(tx, params.idempotencyKey)
  if (existing) return { ok: true, converted: false, points: 0 }

  const account = await lockOrCreateLoyaltyAccount(tx, { agencyId: params.agencyId, customerId: params.customerId })

  const netPending = await sumLedgerForReservation(tx, {
    loyaltyAccountId: account.id,
    reservationId: params.reservationId,
    bucket: "pending",
  })
  if (netPending <= 0) {
    return { ok: false, error: "Aucun point en attente pour cette réservation.", code: "NOTHING_PENDING" }
  }

  const pendingBefore = account.pendingPoints
  const pendingAfter = Math.max(0, pendingBefore - netPending)
  const availableBefore = account.availablePoints
  const availableAfter = availableBefore + netPending

  await insertLedgerRow(tx, {
    agencyId: params.agencyId,
    loyaltyAccountId: account.id,
    customerId: params.customerId,
    type: "convert_pending_out",
    bucket: "pending",
    points: -netPending,
    balanceBefore: pendingBefore,
    balanceAfter: pendingAfter,
    reservationId: params.reservationId,
    description: `Conversion en points disponibles — réservation ${params.reservationId}`,
    idempotencyKey: `${params.idempotencyKey}:out`,
    createdByUserId: params.actorUserId ?? null,
  })
  await insertLedgerRow(tx, {
    agencyId: params.agencyId,
    loyaltyAccountId: account.id,
    customerId: params.customerId,
    type: "convert_available_in",
    bucket: "available",
    points: netPending,
    balanceBefore: availableBefore,
    balanceAfter: availableAfter,
    reservationId: params.reservationId,
    description: `Points disponibles — réservation ${params.reservationId} complétée`,
    idempotencyKey: `${params.idempotencyKey}:in`,
    createdByUserId: params.actorUserId ?? null,
  })

  await tx
    .update(loyaltyAccounts)
    .set({ pendingPoints: pendingAfter, availablePoints: availableAfter, lastActivityAt: new Date(), updatedAt: new Date() })
    .where(eq(loyaltyAccounts.id, account.id))

  return { ok: true, converted: true, points: netPending }
}

/* -------------------------------------------------------------------------- */
/* 3. REVERSE — annulation/remboursement de la réservation qui a généré les  */
/*    points (qu'ils soient encore pending, ou déjà available et non        */
/*    dépensés). Ne rend jamais le solde négatif : ne reprend que ce qui     */
/*    reste effectivement disponible/en attente.                             */
/* -------------------------------------------------------------------------- */

export type ReverseEarnedPointsResult =
  | { ok: true; reversed: boolean; pointsReversedFromPending: number; pointsReversedFromAvailable: number }

export async function reverseEarnedPoints(
  tx: DrizzleTransaction,
  params: { agencyId: string; customerId: string; reservationId: string; idempotencyKey: string; actorUserId?: string },
): Promise<ReverseEarnedPointsResult> {
  const existing = await findLedgerByIdempotencyKey(tx, params.idempotencyKey)
  if (existing) return { ok: true, reversed: false, pointsReversedFromPending: 0, pointsReversedFromAvailable: 0 }

  const account = await lockOrCreateLoyaltyAccount(tx, { agencyId: params.agencyId, customerId: params.customerId })

  const netPending = await sumLedgerForReservation(tx, {
    loyaltyAccountId: account.id,
    reservationId: params.reservationId,
    bucket: "pending",
  })
  const netEarnedAvailable = await sumLedgerForReservation(tx, {
    loyaltyAccountId: account.id,
    reservationId: params.reservationId,
    bucket: "available",
    types: ["convert_available_in", "reverse_available", "reinstate"],
  })
  // Jamais plus que ce qui est réellement disponible sur le compte MAINTENANT
  // (une partie a pu être dépensée entre-temps via redeemPoints ailleurs).
  const pendingToReverse = Math.max(0, Math.min(netPending, account.pendingPoints))
  const availableToReverse = Math.max(0, Math.min(netEarnedAvailable, account.availablePoints))

  if (pendingToReverse <= 0 && availableToReverse <= 0) {
    return { ok: true, reversed: false, pointsReversedFromPending: 0, pointsReversedFromAvailable: 0 }
  }

  let pendingAfter = account.pendingPoints
  let availableAfter = account.availablePoints

  if (pendingToReverse > 0) {
    const before = pendingAfter
    pendingAfter = before - pendingToReverse
    await insertLedgerRow(tx, {
      agencyId: params.agencyId,
      loyaltyAccountId: account.id,
      customerId: params.customerId,
      type: "reverse_pending",
      bucket: "pending",
      points: -pendingToReverse,
      balanceBefore: before,
      balanceAfter: pendingAfter,
      reservationId: params.reservationId,
      description: `Annulation/remboursement — reprise des points en attente, réservation ${params.reservationId}`,
      idempotencyKey: `${params.idempotencyKey}:pending`,
      createdByUserId: params.actorUserId ?? null,
    })
  }
  if (availableToReverse > 0) {
    const before = availableAfter
    availableAfter = before - availableToReverse
    await insertLedgerRow(tx, {
      agencyId: params.agencyId,
      loyaltyAccountId: account.id,
      customerId: params.customerId,
      type: "reverse_available",
      bucket: "available",
      points: -availableToReverse,
      balanceBefore: before,
      balanceAfter: availableAfter,
      reservationId: params.reservationId,
      description: `Annulation/remboursement — reprise des points disponibles, réservation ${params.reservationId}`,
      idempotencyKey: `${params.idempotencyKey}:available`,
      createdByUserId: params.actorUserId ?? null,
    })
  }

  await tx
    .update(loyaltyAccounts)
    .set({ pendingPoints: pendingAfter, availablePoints: availableAfter, lastActivityAt: new Date(), updatedAt: new Date() })
    .where(eq(loyaltyAccounts.id, account.id))

  return {
    ok: true,
    reversed: true,
    pointsReversedFromPending: pendingToReverse,
    pointsReversedFromAvailable: availableToReverse,
  }
}

/* -------------------------------------------------------------------------- */
/* 4. REDEEM — dépense de points disponibles, plafonnée par la réservation   */
/*    cible. Mouvement de grand livre uniquement (voir doc de tête).         */
/* -------------------------------------------------------------------------- */

export type RedeemPointsResult =
  | { ok: true; points: number; tndEquivalent: number }
  | {
      ok: false
      error: string
      code: "BELOW_MINIMUM" | "ABOVE_MAXIMUM" | "INSUFFICIENT_BALANCE"
    }

export async function redeemPoints(
  tx: DrizzleTransaction,
  params: {
    agencyId: string
    customerId: string
    /** Réservation contre laquelle la rédemption est plafonnée (10% de son montant TND éligible) et tracée. */
    targetReservationId: string
    targetReservationEligibleTnd: number
    pointsToRedeem: number
    idempotencyKey: string
    actorUserId?: string
  },
): Promise<RedeemPointsResult> {
  if (params.pointsToRedeem < MIN_REDEMPTION_POINTS) {
    return {
      ok: false,
      error: `Rédemption minimale : ${MIN_REDEMPTION_POINTS} points.`,
      code: "BELOW_MINIMUM",
    }
  }
  const maxPoints = computeMaxRedeemablePoints(params.targetReservationEligibleTnd)
  if (params.pointsToRedeem > maxPoints) {
    return {
      ok: false,
      error: `Rédemption maximale pour cette réservation : ${maxPoints} points (10% du montant éligible).`,
      code: "ABOVE_MAXIMUM",
    }
  }

  const existing = await findLedgerByIdempotencyKey(tx, params.idempotencyKey)
  if (existing) {
    return { ok: true, points: params.pointsToRedeem, tndEquivalent: pointsToTndEquivalent(params.pointsToRedeem) }
  }

  const account = await lockOrCreateLoyaltyAccount(tx, { agencyId: params.agencyId, customerId: params.customerId })
  if (account.availablePoints < params.pointsToRedeem) {
    return {
      ok: false,
      error: `Solde disponible insuffisant : ${account.availablePoints} points, ${params.pointsToRedeem} demandés.`,
      code: "INSUFFICIENT_BALANCE",
    }
  }

  const before = account.availablePoints
  const after = before - params.pointsToRedeem

  await insertLedgerRow(tx, {
    agencyId: params.agencyId,
    loyaltyAccountId: account.id,
    customerId: params.customerId,
    type: "redeem",
    bucket: "available",
    points: -params.pointsToRedeem,
    balanceBefore: before,
    balanceAfter: after,
    reservationId: params.targetReservationId,
    description: `Rédemption — réservation ${params.targetReservationId}`,
    idempotencyKey: params.idempotencyKey,
    createdByUserId: params.actorUserId ?? null,
  })

  await tx
    .update(loyaltyAccounts)
    .set({
      availablePoints: after,
      lifetimeRedeemedPoints: account.lifetimeRedeemedPoints + params.pointsToRedeem,
      lastActivityAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(loyaltyAccounts.id, account.id))

  return { ok: true, points: params.pointsToRedeem, tndEquivalent: pointsToTndEquivalent(params.pointsToRedeem) }
}

/* -------------------------------------------------------------------------- */
/* 5. REINSTATE — la réservation CONTRE laquelle des points avaient été     */
/*    dépensés est elle-même annulée/remboursée : on rend les points        */
/*    effectivement dépensés sur CETTE réservation, jamais plus.            */
/* -------------------------------------------------------------------------- */

export type ReinstateRedeemedPointsResult =
  | { ok: true; reinstated: boolean; points: number }

export async function reinstateRedeemedPoints(
  tx: DrizzleTransaction,
  params: { agencyId: string; customerId: string; reservationId: string; idempotencyKey: string; actorUserId?: string },
): Promise<ReinstateRedeemedPointsResult> {
  const existing = await findLedgerByIdempotencyKey(tx, params.idempotencyKey)
  if (existing) return { ok: true, reinstated: false, points: 0 }

  const account = await lockOrCreateLoyaltyAccount(tx, { agencyId: params.agencyId, customerId: params.customerId })

  const redeemedForThisReservation = await sumLedgerForReservation(tx, {
    loyaltyAccountId: account.id,
    reservationId: params.reservationId,
    bucket: "available",
    types: ["redeem"],
  })
  const alreadyReinstated = await sumLedgerForReservation(tx, {
    loyaltyAccountId: account.id,
    reservationId: params.reservationId,
    bucket: "available",
    types: ["reinstate"],
  })
  // `redeemedForThisReservation` est négatif (débit) ; on ne réinstalle que
  // ce qui n'a pas déjà été réinstallé par un appel précédent.
  const toReinstate = Math.max(0, -redeemedForThisReservation - alreadyReinstated)
  if (toReinstate <= 0) {
    return { ok: true, reinstated: false, points: 0 }
  }

  const before = account.availablePoints
  const after = before + toReinstate

  await insertLedgerRow(tx, {
    agencyId: params.agencyId,
    loyaltyAccountId: account.id,
    customerId: params.customerId,
    type: "reinstate",
    bucket: "available",
    points: toReinstate,
    balanceBefore: before,
    balanceAfter: after,
    reservationId: params.reservationId,
    description: `Annulation/remboursement — restitution des points dépensés, réservation ${params.reservationId}`,
    idempotencyKey: params.idempotencyKey,
    createdByUserId: params.actorUserId ?? null,
  })

  await tx
    .update(loyaltyAccounts)
    .set({
      availablePoints: after,
      lifetimeRedeemedPoints: Math.max(0, account.lifetimeRedeemedPoints - toReinstate),
      lastActivityAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(loyaltyAccounts.id, account.id))

  return { ok: true, reinstated: true, points: toReinstate }
}

/* -------------------------------------------------------------------------- */
/* 6. EXPIRE — 24 mois d'inactivité. Traitement par lot (cron), une agence à */
/*    la fois — jamais une politique inventée au-delà de "24 mois".          */
/* -------------------------------------------------------------------------- */

export interface ExpireInactiveAccountsResult {
  accountsExpired: number
  totalPointsExpired: number
}

export async function expireInactiveAccountsForAgency(
  tx: DrizzleTransaction,
  params: { agencyId: string; now?: Date },
): Promise<ExpireInactiveAccountsResult> {
  const now = params.now ?? new Date()
  const cutoff = new Date(now)
  cutoff.setMonth(cutoff.getMonth() - INACTIVITY_EXPIRY_MONTHS)

  const candidates = await tx
    .select()
    .from(loyaltyAccounts)
    .where(
      and(
        eq(loyaltyAccounts.agencyId, params.agencyId),
        sql`${loyaltyAccounts.lastActivityAt} < ${cutoff.toISOString()}`,
        sql`(${loyaltyAccounts.pendingPoints} > 0 or ${loyaltyAccounts.availablePoints} > 0)`,
      ),
    )

  let accountsExpired = 0
  let totalPointsExpired = 0

  for (const candidate of candidates) {
    const [locked] = await tx
      .select()
      .from(loyaltyAccounts)
      .where(eq(loyaltyAccounts.id, candidate.id))
      .for("update")
    if (!locked) continue
    // Re-vérifie sous verrou (une activité a pu survenir entre la lecture et le verrou).
    if (!isExpiredByInactivity(locked.lastActivityAt, now)) continue
    const totalToExpire = locked.pendingPoints + locked.availablePoints
    if (totalToExpire <= 0) continue

    const idempotencyKey = `expire:${locked.id}:${now.toISOString().slice(0, 10)}`
    const existing = await findLedgerByIdempotencyKey(tx, idempotencyKey)
    if (existing) continue

    if (locked.pendingPoints > 0) {
      await insertLedgerRow(tx, {
        agencyId: params.agencyId,
        loyaltyAccountId: locked.id,
        customerId: locked.customerId,
        type: "expire",
        bucket: "pending",
        points: -locked.pendingPoints,
        balanceBefore: locked.pendingPoints,
        balanceAfter: 0,
        description: "Expiration — 24 mois d'inactivité",
        idempotencyKey: `${idempotencyKey}:pending`,
      })
    }
    if (locked.availablePoints > 0) {
      await insertLedgerRow(tx, {
        agencyId: params.agencyId,
        loyaltyAccountId: locked.id,
        customerId: locked.customerId,
        type: "expire",
        bucket: "available",
        points: -locked.availablePoints,
        balanceBefore: locked.availablePoints,
        balanceAfter: 0,
        description: "Expiration — 24 mois d'inactivité",
        idempotencyKey: `${idempotencyKey}:available`,
      })
    }

    await tx
      .update(loyaltyAccounts)
      .set({ pendingPoints: 0, availablePoints: 0, updatedAt: new Date() })
      .where(eq(loyaltyAccounts.id, locked.id))

    accountsExpired += 1
    totalPointsExpired += totalToExpire
  }

  return { accountsExpired, totalPointsExpired }
}
