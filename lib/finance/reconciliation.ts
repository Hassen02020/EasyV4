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
 * n'est pas corrigé.
 *
 * Sortie : chaque écart devient une ligne `audit_events`
 * (entityType="reconciliation"), réutilisant /admin/logs (déjà existant)
 * comme seule surface de visibilité — pas de nouvelle table ni de nouvelle
 * page admin en v1.
 */

import { and, eq, gte, isNotNull, isNull, lt, sql } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import type { DrizzleTransaction } from "@/lib/db/client"
import { pspWebhooks, payments, reservations, agencies, partnerCreditMovements, auditEvents } from "@/lib/db/schema"

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
  details: Record<string, unknown>
}

/** Grâce au-delà de la fenêtre de paiement avant de considérer un paiement "coincé". */
const STUCK_PAYMENT_GRACE_MS = 15 * 60 * 1000 // 15 min

async function findOrphanedWebhooks(tx: DrizzleTransaction, since: Date): Promise<ReconciliationFinding[]> {
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

  return rows
    .filter((r) => r.agencyId || fallbackAgencyId)
    .map((r) => ({
      check: "orphaned_webhook" as const,
      agencyId: (r.agencyId ?? fallbackAgencyId)!,
      details: {
        pspWebhookId: r.id,
        psp: r.psp,
        eventType: r.eventType,
        error: r.error,
        receivedAt: r.createdAt,
      },
    }))
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
    details: {
      reservationId: r.reservationId,
      publicRef: r.publicRef,
      confirmedAt: r.confirmedAt,
    },
  }))
}

async function findWalletLedgerDrift(tx: DrizzleTransaction): Promise<ReconciliationFinding[]> {
  // DISTINCT ON : dernier mouvement (par created_at) pour chaque agence —
  // comparé au solde stocké, seule source de vérité affichée aux agences.
  const rows = (await tx.execute(sql`
    select a.id as agency_id, a.deposit_balance, m.balance_after as last_balance_after
    from ${agencies} a
    inner join lateral (
      select balance_after
      from ${partnerCreditMovements} pcm
      where pcm.agency_id = a.id
      order by pcm.created_at desc
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
    details: {
      storedBalance: r.deposit_balance,
      lastLedgerBalance: r.last_balance_after,
    },
  }))
}

export interface ReconciliationResult {
  findings: ReconciliationFinding[]
  counts: Record<ReconciliationCheck, number>
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

  const findings = await withSystemContext(async (tx) => {
    const [orphaned, stuck, confirmedWithoutPayment, walletDrift] = await Promise.all([
      findOrphanedWebhooks(tx, since),
      findStuckPendingPayments(tx, since),
      findConfirmedWithoutPayment(tx, since),
      findWalletLedgerDrift(tx),
    ])
    const all = [...orphaned, ...stuck, ...confirmedWithoutPayment, ...walletDrift]

    if (all.length > 0) {
      await tx.insert(auditEvents).values(
        all.map((f) => ({
          agencyId: f.agencyId,
          entityType: "reconciliation",
          entityId: String(f.details.reservationId ?? f.details.paymentId ?? f.details.pspWebhookId ?? f.agencyId),
          action: f.check,
          diff: f.details,
        })),
      )
    }

    return all
  })

  const counts: Record<ReconciliationCheck, number> = {
    orphaned_webhook: 0,
    stuck_pending_payment: 0,
    confirmed_without_payment: 0,
    wallet_ledger_drift: 0,
  }
  for (const f of findings) counts[f.check]++

  return { findings, counts }
}
