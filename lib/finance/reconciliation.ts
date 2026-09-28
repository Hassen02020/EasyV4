/**
 * Réconciliation financière — détecte les dérives entre les tables locales
 * (payments/pspWebhooks/reservations/partnerCreditMovements) SANS jamais
 * appeler l'API Paymee : cet environnement n'a pas accès au sandbox Paymee
 * (réseau bloqué), donc un contrôle qui dépendrait d'un appel réel serait
 * invérifiable ici — voir lib/payment/paymee-provider.ts (même limite déjà
 * documentée pour l'adaptateur lui-même). V1 volontairement scopé aux
 * incohérences détectables en interne :
 *
 *  1. orphaned_webhook — un webhook PSP reçu mais jamais rattaché à un
 *     paiement local (payload signé, argent potentiellement déjà capturé
 *     côté Paymee, aucune trace locale exploitable).
 *  2. stuck_pending_payment — un paiement carte resté "pending" après
 *     l'échéance sans que le cron expire-pending-payments l'ait couvert
 *     (dérive entre les deux jobs, ou un cron qui n'a pas tourné).
 *  3. confirmed_without_payment — une réservation confirmée sans paiement
 *     capturé correspondant (méthode carte) : preuve de paiement manquante.
 *  4. wallet_ledger_drift — le solde stocké (agencies.deposit_balance) ne
 *     correspond plus au dernier mouvement du grand livre
 *     (partner_credit_movements.balance_after) : bug de tenue de compte.
 *
 * Fenêtre glissante (checks 1-3) : ne re-signale QUE les événements
 * apparus depuis le dernier passage (~25h, légèrement > le cycle cron
 * quotidien pour ne jamais laisser de trou), pour ne pas re-notifier
 * indéfiniment le même incident chaque jour. Le check 4 est un contrôle
 * d'état (pas un événement) — rescanné intégralement à chaque passage,
 * volontairement : un solde qui dérive doit rester visible tant qu'il
 * n'est pas corrigé (son entityId inclut la date du jour — voir
 * findWalletLedgerDrift — pour rester idempotent PAR JOUR sans jamais
 * supprimer le signalement des jours suivants).
 *
 * Sortie : chaque écart devient une ligne `audit_events`
 * (entityType="reconciliation"), réutilisant /admin/logs (déjà existant)
 * comme seule surface de visibilité — pas de nouvelle table ni de nouvelle
 * page admin en v1.
 *
 * Garanties de sûreté (durcies après revue) :
 *  - Concurrence : `pg_try_advisory_xact_lock` pris en tout premier dans la
 *    transaction système — une deuxième exécution qui chevaucherait la
 *    première (retry cron, déclenchement manuel concurrent) repart
 *    immédiatement avec `skipped: true`, aucune requête de contrôle exécutée,
 *    jamais deux passages qui journalisent le même écart en double par pure
 *    course. Le verrou est *transactionnel* (pg_try_advisory_XACT_lock, pas
 *    _lock) : relâché automatiquement au commit/rollback, jamais de verrou
 *    orphelin si le process meurt en cours de route.
 *  - Idempotence : `audit_events (entity_type, entity_id, action)` porte un
 *    index unique PARTIEL (entity_type='reconciliation', voir
 *    drizzle/manual/0059_reconciliation_idempotency.sql) — l'insertion
 *    passe par `ON CONFLICT ... DO NOTHING` sur cet index exact (une cible
 *    de colonnes sans la clause WHERE ne suffit PAS à matcher un index
 *    partiel côté Postgres, d'où le SQL brut ci-dessous plutôt que le
 *    query-builder). Un même écart détecté deux fois (verrou concurrent
 *    manqué par hasard, ou ré-exécution manuelle) ne produit jamais une
 *    deuxième ligne.
 *  - Aucune écriture de règlement : cette fonction ne touche jamais
 *    `payments`/`reservations`/`partner_credit_movements`/tout solde — seule
 *    surface d'écriture : `audit_events`, une table d'audit en lecture pour
 *    les humains, jamais consommée par un flux de paiement.
 */

import { and, eq, gte, isNotNull, isNull, lt, sql } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import type { DrizzleTransaction } from "@/lib/db/client"
import { pspWebhooks, payments, reservations, agencies, partnerCreditMovements } from "@/lib/db/schema"
import { logger } from "@/lib/logger"

/**
 * Agence OTA par défaut — pour rattacher un écart qui n'a pas d'agence
 * naturelle (webhook orphelin, `psp_webhooks.agency_id` posé à `null` par
 * lib/payment/reservation-webhook-core.ts pour NO_MATCHING_PAYMENT/
 * UNPARSEABLE_PAYLOAD). Requête directe (pas `lib/agencies/default-agency.ts`
 * ::getDefaultAgencyId()) : cette fonction importe `server-only` via
 * lib/tenant/current-tenant.ts, incompatible avec le test runner Node natif
 * (`node --test`) — un cron n'a de toute façon jamais de contexte
 * requête/tenant à résoudre, donc reproduit ici uniquement le fallback OTA
 * que getDefaultAgencyId() utiliserait dans ce même cas.
 */
async function resolveFallbackAgencyId(tx: DrizzleTransaction): Promise<string | null> {
  const [agency] = await tx
    .select({ id: agencies.id })
    .from(agencies)
    .where(and(eq(agencies.agencyType, "ota"), isNull(agencies.domain)))
    .limit(1)
  return agency?.id ?? null
}

export type ReconciliationCheck =
  | "orphaned_webhook"
  | "stuck_pending_payment"
  | "confirmed_without_payment"
  | "wallet_ledger_drift"

export interface ReconciliationFinding {
  check: ReconciliationCheck
  agencyId: string
  /** Clé stable de l'écart — porte l'idempotence (voir audit_events_reconciliation_uniq). */
  entityId: string
  details: Record<string, unknown>
}

/** Grâce au-delà de la fenêtre de paiement avant de considérer un paiement "coincé". */
const STUCK_PAYMENT_GRACE_MS = 15 * 60 * 1000 // 15 min

/**
 * Clé du verrou advisory dédié à ce job — arbitraire mais stable, choisie
 * pour ne collisionner avec aucun autre usage de pg_advisory_*lock dans
 * l'application (aucun autre à ce jour, recherche faite avant ce correctif).
 * Exportée uniquement pour que le test de concurrence puisse tenir le même
 * verrou depuis une transaction séparée et vérifier un vrai chevauchement
 * (pas une simple course entre deux appels rapides).
 */
export const RECONCILIATION_LOCK_KEY = BigInt(847_362_910_123)

/** Rattache un écart "orphelin" (pas d'agence déterminable) sans jamais le passer sous silence. */
async function findOrphanedWebhooks(
  tx: DrizzleTransaction,
  since: Date,
): Promise<{ findings: ReconciliationFinding[]; unresolvedAgencyWarnings: number }> {
  const rows = await tx
    .select({
      id: pspWebhooks.id,
      agencyId: pspWebhooks.agencyId,
      psp: pspWebhooks.psp,
      eventType: pspWebhooks.eventType,
      error: pspWebhooks.error,
      createdAt: pspWebhooks.createdAt,
    })
    .from(pspWebhooks)
    .where(and(isNotNull(pspWebhooks.error), gte(pspWebhooks.createdAt, since)))

  const fallbackAgencyId = rows.some((r) => !r.agencyId) ? await resolveFallbackAgencyId(tx) : null

  const findings: ReconciliationFinding[] = []
  let unresolvedAgencyWarnings = 0

  for (const r of rows) {
    const agencyId = r.agencyId ?? fallbackAgencyId
    if (!agencyId) {
      // Ne JAMAIS passer sous silence : aucune agence OTA par défaut n'existe
      // (mauvaise configuration plateforme) — on ne peut pas écrire dans
      // audit_events (agency_id NOT NULL), mais on ne disparaît pas pour
      // autant. Compté dans le résultat + log serveur visible (Vercel logs).
      unresolvedAgencyWarnings++
      logger.error("[reconciliation] webhook orphelin sans agence attribuable — aucune agence OTA par défaut", {
        pspWebhookId: r.id,
        psp: r.psp,
        eventType: r.eventType,
        error: r.error,
      })
      continue
    }
    findings.push({
      check: "orphaned_webhook",
      agencyId,
      entityId: r.id,
      details: {
        pspWebhookId: r.id,
        psp: r.psp,
        eventType: r.eventType,
        error: r.error,
        receivedAt: r.createdAt,
      },
    })
  }

  return { findings, unresolvedAgencyWarnings }
}

async function findStuckPendingPayments(tx: DrizzleTransaction, since: Date): Promise<ReconciliationFinding[]> {
  const deadline = new Date(Date.now() - STUCK_PAYMENT_GRACE_MS)
  const rows = await tx
    .select({
      paymentId: payments.id,
      agencyId: payments.agencyId,
      reservationId: payments.reservationId,
      publicRef: reservations.publicRef,
      reservationStatus: reservations.status,
      paymentExpiresAt: reservations.paymentExpiresAt,
    })
    .from(payments)
    .innerJoin(reservations, eq(reservations.id, payments.reservationId))
    .where(
      and(
        eq(payments.status, "pending"),
        eq(payments.method, "card"),
        isNotNull(reservations.paymentExpiresAt),
        lt(reservations.paymentExpiresAt, deadline),
        gte(reservations.paymentExpiresAt, since),
        sql`${reservations.status} != 'expired'`,
      ),
    )

  return rows.map((r) => ({
    check: "stuck_pending_payment" as const,
    agencyId: r.agencyId,
    entityId: r.paymentId,
    details: {
      paymentId: r.paymentId,
      reservationId: r.reservationId,
      publicRef: r.publicRef,
      reservationStatus: r.reservationStatus,
      paymentExpiresAt: r.paymentExpiresAt,
    },
  }))
}

async function findConfirmedWithoutPayment(tx: DrizzleTransaction, since: Date): Promise<ReconciliationFinding[]> {
  const rows = await tx
    .select({
      reservationId: reservations.id,
      agencyId: reservations.agencyId,
      publicRef: reservations.publicRef,
      confirmedAt: reservations.confirmedAt,
    })
    .from(reservations)
    .where(
      and(
        eq(reservations.status, "confirmed"),
        isNotNull(reservations.confirmedAt),
        gte(reservations.confirmedAt, since),
        sql`not exists (
          select 1 from ${payments}
          where ${payments.reservationId} = ${reservations.id}
            and ${payments.status} = 'captured'
        )`,
      ),
    )

  return rows.map((r) => ({
    check: "confirmed_without_payment" as const,
    agencyId: r.agencyId,
    entityId: r.reservationId,
    details: {
      reservationId: r.reservationId,
      publicRef: r.publicRef,
      confirmedAt: r.confirmedAt,
    },
  }))
}

/**
 * `dayBucket` (YYYY-MM-DD UTC) fait partie de l'entityId : ce check est un
 * contrôle d'ÉTAT (pas un événement daté), rescanné intégralement à chaque
 * passage par conception — sans le bucket, l'index unique sur
 * (entity_type, entity_id, action) supprimerait silencieusement tout
 * signalement après le premier jour, alors qu'une dérive non corrigée doit
 * rester visible chaque jour. Le bucket rend l'écriture idempotente PAR
 * JOUR (protège contre deux passages qui se chevaupent le même jour) sans
 * jamais supprimer le signalement les jours suivants.
 */
async function findWalletLedgerDrift(tx: DrizzleTransaction, dayBucket: string): Promise<ReconciliationFinding[]> {
  // ORDER BY created_at DESC, id DESC : le tiebreaker sur `id` n'a aucune
  // signification d'ordre d'insertion (uuid v4 aléatoire) — son seul rôle
  // est de rendre le choix DÉTERMINISTE (toujours la même ligne choisie en
  // cas d'égalité de created_at) pour ne jamais faire flapper ce contrôle
  // entre deux exécutions sur les mêmes données. Sans lui, deux mouvements
  // au même timestamp exact pouvaient faire basculer le résultat au hasard
  // du plan d'exécution Postgres.
  const rows = (await tx.execute(sql`
    select a.id as agency_id, a.deposit_balance, m.balance_after as last_balance_after
    from ${agencies} a
    inner join lateral (
      select balance_after
      from ${partnerCreditMovements} pcm
      where pcm.agency_id = a.id
      order by pcm.created_at desc, pcm.id desc
      limit 1
    ) m on true
    where a.deposit_balance::numeric != m.balance_after::numeric
  `)) as Array<{
    agency_id: string
    deposit_balance: string
    last_balance_after: string
  }>

  return rows.map((r) => ({
    check: "wallet_ledger_drift" as const,
    agencyId: r.agency_id,
    entityId: `${r.agency_id}:${dayBucket}`,
    details: {
      storedBalance: r.deposit_balance,
      lastLedgerBalance: r.last_balance_after,
    },
  }))
}

export interface ReconciliationResult {
  findings: ReconciliationFinding[]
  counts: Record<ReconciliationCheck, number>
  /** true si une exécution concurrente tenait déjà le verrou — ce passage n'a rien vérifié. */
  skipped: boolean
  /** Webhooks orphelins qu'aucune agence n'a pu recevoir (voir findOrphanedWebhooks) — jamais silencieux, toujours dans ce compteur + les logs serveur. */
  unresolvedAgencyWarnings: number
}

/**
 * Exécute les 4 contrôles et journalise chaque écart trouvé dans
 * `audit_events` (entityType="reconciliation") — jamais d'action corrective
 * automatique, uniquement de la détection : une dérive financière doit
 * toujours être résolue par un humain qui en comprend la cause exacte.
 */
export async function runPaymentReconciliation(
  windowMs = 25 * 60 * 60 * 1000,
): Promise<ReconciliationResult> {
  const since = new Date(Date.now() - windowMs)
  const dayBucket = new Date().toISOString().slice(0, 10)

  const result = await withSystemContext(async (tx) => {
    // Verrou transactionnel non bloquant : une deuxième exécution
    // concurrente (chevauchement cron, déclenchement manuel) reçoit
    // `locked: false` immédiatement plutôt que d'attendre — jamais deux
    // passages qui exécutent les contrôles en parallèle sur la même fenêtre.
    const [{ locked }] = (await tx.execute(
      sql`select pg_try_advisory_xact_lock(${RECONCILIATION_LOCK_KEY}) as locked`,
    )) as Array<{ locked: boolean }>

    if (!locked) {
      return { findings: [] as ReconciliationFinding[], unresolvedAgencyWarnings: 0, skipped: true }
    }

    const [orphaned, stuck, confirmedWithoutPayment, walletDrift] = await Promise.all([
      findOrphanedWebhooks(tx, since),
      findStuckPendingPayments(tx, since),
      findConfirmedWithoutPayment(tx, since),
      findWalletLedgerDrift(tx, dayBucket),
    ])
    const all = [...orphaned.findings, ...stuck, ...confirmedWithoutPayment, ...walletDrift]

    if (all.length > 0) {
      // SQL brut + ON CONFLICT ciblant explicitement l'index unique PARTIEL
      // (voir audit_events_reconciliation_uniq) : le query-builder Drizzle
      // (`.onConflictDoNothing({ target: [...] })`) ne peut pas exprimer la
      // clause WHERE requise pour qu'un ON CONFLICT matche un index partiel
      // — sans elle Postgres répondrait "no unique or exclusion constraint
      // matching the ON CONFLICT specification" (même classe de bug déjà
      // rencontrée sur inventory_locks dans ce projet). jsonb_to_recordset
      // pour une insertion en lot en un seul aller-retour, quel que soit le
      // nombre d'écarts trouvés.
      const rows = all.map((f) => ({
        agency_id: f.agencyId,
        entity_type: "reconciliation",
        entity_id: f.entityId,
        action: f.check,
        diff: f.details,
      }))
      await tx.execute(sql`
        insert into audit_events (agency_id, entity_type, entity_id, action, diff)
        select agency_id, entity_type, entity_id, action, diff
        from jsonb_to_recordset(${JSON.stringify(rows)}::jsonb)
          as x(agency_id uuid, entity_type text, entity_id text, action text, diff jsonb)
        on conflict (entity_type, entity_id, action) where entity_type = 'reconciliation'
        do nothing
      `)
    }

    return { findings: all, unresolvedAgencyWarnings: orphaned.unresolvedAgencyWarnings, skipped: false }
  })

  const counts: Record<ReconciliationCheck, number> = {
    orphaned_webhook: 0,
    stuck_pending_payment: 0,
    confirmed_without_payment: 0,
    wallet_ledger_drift: 0,
  }
  for (const f of result.findings) counts[f.check]++

  return {
    findings: result.findings,
    counts,
    skipped: result.skipped,
    unresolvedAgencyWarnings: result.unresolvedAgencyWarnings,
  }
}
