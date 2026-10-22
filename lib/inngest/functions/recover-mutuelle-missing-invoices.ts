/**
 * Inngest Function — recoverMutuelleMissingInvoices (CAS-C, MUTUELLE-CONCURRENCY-COMPLETE-01)
 *
 * Garantie durable de récupération pour la génération de facture Mutuelle,
 * INDÉPENDANTE de l'événement `booking/mutuelle.confirmed` : `sendEvent()`
 * (lib/mutuelle/requests-actions.ts) reste fire-and-forget, hors transaction
 * DB, sans retry applicatif — si le processus Node meurt entre le commit de
 * la réservation et l'envoi de cet événement, l'événement n'est jamais créé
 * et le step.run de processMutuelleConfirmed (lib/inngest/functions/
 * process-mutuelle-confirmed.ts) n'a rien à rejouer. Ce cron ne dépend
 * d'aucun événement : il interroge directement l'état DB (réservation
 * confirmée sans facture) et corrige.
 *
 * Génère une facture "issued" (MUTUELLE-INVOICE-SETTLEMENT-01) — jamais
 * "paid" : une récupération après interruption n'est pas plus une preuve de
 * paiement qu'une approbation directeur ordinaire. Utilise délibérément
 * generateIssuedInvoiceForReservation, pas generateInvoiceForReservation.
 *
 * Idempotence : generateIssuedInvoiceForReservation est déjà idempotente au
 * niveau DB (contrainte partner_invoices_reservation_uniq + relecture sur
 * conflit) — un appel redondant (retry Inngest, ou concurrence avec le
 * step.run de processMutuelleConfirmed sur la même réservation) ne crée
 * jamais de doublon.
 *
 * Filtrage par agence : chaque appel à generateIssuedInvoiceForReservation
 * est scopé avec l'agencyId RÉEL de la réservation trouvée (jamais un
 * contexte global/cross-agence pour l'écriture elle-même) — withSystemContext
 * n'est utilisé QUE pour la lecture de repérage cross-agence (même patron
 * que notify-stale-leads.ts), pas pour l'écriture de la facture.
 *
 * Erreurs : une réservation en échec ne bloque jamais les autres (boucle
 * avec try/catch par ligne, résultats agrégés).
 *
 * Ne modifie PAS lib/finance/reconciliation.ts (contrat "détection pure"
 * préservé) — fonction cron dédiée et séparée.
 */

import { isNull, and, eq, sql } from "drizzle-orm"
import { inngest } from "@/lib/inngest/client"
import { makeOnFailure } from "@/lib/inngest/on-failure"
import { withSystemContext } from "@/lib/db/tenant-context"
import {
  reservations,
  partnerInvoices,
  mutuelleRequests,
} from "@/lib/db/schema"
import { generateIssuedInvoiceForReservation } from "@/lib/finance/invoice-actions"

export interface MissingInvoiceRow {
  reservationId: string
  agencyId: string
  publicRef: string
  directorUserId: string | null
}

export interface RecoverMutuelleInvoicesResult {
  checked: number
  recovered: number
  skipped: number
  failed: number
}

/** Exportée pour test direct (live DB) — même requête que le cron, sans le wrapper Inngest. */
export async function findMutuelleReservationsMissingInvoice(): Promise<
  MissingInvoiceRow[]
> {
  return withSystemContext((tx) =>
    tx
      .select({
        reservationId: reservations.id,
        agencyId: reservations.agencyId,
        publicRef: reservations.publicRef,
        directorUserId: mutuelleRequests.reviewedByUserId,
      })
      .from(reservations)
      .leftJoin(
        partnerInvoices,
        eq(partnerInvoices.reservationId, reservations.id),
      )
      .leftJoin(
        mutuelleRequests,
        sql`${mutuelleRequests.id} = (${reservations.providerPayload}->>'mutuelleRequestId')::uuid`,
      )
      .where(
        and(
          eq(reservations.status, "confirmed"),
          sql`${reservations.providerPayload}->>'channel' = 'mutuelle_b2b2c'`,
          isNull(partnerInvoices.id),
        ),
      ),
  )
}

/**
 * Logique cœur de récupération — détection + correction, sans wrapper
 * Inngest. Exportée pour test direct (live DB) ; le step.run ci-dessous
 * l'appelle telle quelle en production.
 */
export async function recoverMutuelleInvoicesCore(): Promise<RecoverMutuelleInvoicesResult> {
  const candidates = await findMutuelleReservationsMissingInvoice()

  if (candidates.length === 0) {
    return { checked: 0, recovered: 0, skipped: 0, failed: 0 }
  }

  let recovered = 0
  let skipped = 0
  let failed = 0

  for (const row of candidates) {
    if (!row.directorUserId) {
      console.error(
        "[recover-mutuelle-missing-invoices] reviewedByUserId introuvable — skip",
        { reservationId: row.reservationId, publicRef: row.publicRef },
      )
      skipped++
      continue
    }

    try {
      const result = await generateIssuedInvoiceForReservation({
        agencyId: row.agencyId,
        reservationId: row.reservationId,
        actorUserId: row.directorUserId,
      })
      if (result.ok) {
        recovered++
      } else {
        console.error(
          "[recover-mutuelle-missing-invoices] génération facture échouée",
          {
            reservationId: row.reservationId,
            publicRef: row.publicRef,
            error: result.error,
          },
        )
        failed++
      }
    } catch (err) {
      console.error(
        "[recover-mutuelle-missing-invoices] exception inattendue",
        {
          reservationId: row.reservationId,
          publicRef: row.publicRef,
          err: err instanceof Error ? err.message : String(err),
        },
      )
      failed++
    }
  }

  return { checked: candidates.length, recovered, skipped, failed }
}

export const recoverMutuelleMissingInvoices = inngest.createFunction(
  {
    id: "recover-mutuelle-missing-invoices",
    name: "Mutuelle B2B2C — récupération factures manquantes (CAS-C, cron)",
    retries: 2,
    triggers: { cron: "*/15 * * * *" },
    onFailure: makeOnFailure("recover-mutuelle-missing-invoices"),
  },
  async ({
    step,
  }: {
    step: { run: <T>(name: string, fn: () => Promise<T>) => Promise<T> }
  }) => {
    const runAt = new Date().toISOString()
    return step.run(
      `recover-mutuelle-invoices-${runAt}`,
      recoverMutuelleInvoicesCore,
    )
  },
)
