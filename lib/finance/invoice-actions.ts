"use server"

/**
 * Génération et lecture des factures partenaire (`partner_invoices`).
 *
 * Remplace le stub `lib/finance/invoice-generator.ts::generateInvoicePDF`
 * (lève une exception inconditionnelle — jsPDF jamais installé, jamais
 * appelé par aucun flux réel) par une vraie écriture DB, tenant-scopée,
 * idempotente : `generateInvoiceForReservation` ne crée jamais deux
 * factures pour la même réservation, y compris sous deux appels
 * concurrents (voir la garantie DB dans
 * drizzle/manual/0019_partner_invoices_reservation_link.sql).
 *
 * Ne génère PAS de PDF (aucune librairie de rendu PDF générique n'est
 * installée dans ce projet — seul @react-pdf/renderer existe, utilisé
 * uniquement pour le voucher hôtel). La facture est un enregistrement
 * financier réel (montant, TVA, statut, ligne(s), lien réservation) —
 * l'export PDF téléchargeable reste à construire séparément (voir le
 * rapport d'audit final).
 *
 * Le calcul HT/TVA/TTC est volontairement simple (TVA = 0, HT = TTC) :
 * aucun taux de TVA n'est modélisé ailleurs dans l'application (le
 * générateur mort le notait déjà "à calculer selon les taux TVA") — on
 * n'invente pas une logique fiscale qui n'existe nulle part ailleurs dans
 * le code.
 */

import { desc, eq } from "drizzle-orm"
import { withTenantContext } from "@/lib/db/tenant-context"
import { agencies, partnerInvoices, reservations } from "@/lib/db/schema"
import type { DrizzleTransaction } from "@/lib/db/client"
import { pgErrorCode } from "@/lib/db/pg-error"

/* -------------------------------------------------------------------------- */
/* Génération                                                                  */
/* -------------------------------------------------------------------------- */

export interface GenerateInvoiceInput {
  agencyId: string
  reservationId: string
  actorUserId: string
}

export type GenerateInvoiceResult =
  | { ok: true; invoiceId: string; invoiceNumber: string; alreadyExisted: boolean }
  | { ok: false; error: string }

function pad(n: number, w = 5) {
  return String(n).padStart(w, "0")
}

async function nextInvoiceNumber(tx: DrizzleTransaction, agencyId: string): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `FA-${year}-`
  const existing = await tx
    .select({ invoiceNumber: partnerInvoices.invoiceNumber })
    .from(partnerInvoices)
    .where(eq(partnerInvoices.agencyId, agencyId))
  const max = existing
    .map((r) => r.invoiceNumber)
    .filter((n) => n.startsWith(prefix))
    .map((n) => Number(n.slice(prefix.length)))
    .filter((n) => Number.isFinite(n))
    .reduce((a, b) => Math.max(a, b), 0)
  return `${prefix}${pad(max + 1)}`
}

/**
 * Génère (ou retourne l'existante) la facture d'une réservation confirmée.
 * Idempotent : deux appels concurrents pour la même réservation ne créent
 * jamais deux lignes — protégé par l'index unique partiel
 * `partner_invoices_reservation_uniq` (voir migration 0019). Sur conflit,
 * on relit et retourne la facture déjà créée par l'appel gagnant plutôt
 * que d'échouer.
 */
export async function generateInvoiceForReservation(
  input: GenerateInvoiceInput,
): Promise<GenerateInvoiceResult> {
  if (!process.env.DATABASE_URL) {
    return { ok: false, error: "Base de données non configurée" }
  }

  try {
    return await withTenantContext(
      { agencyId: input.agencyId, userId: input.actorUserId, isSuperAdmin: false },
      async (tx) => {
        const [reservation] = await tx
          .select()
          .from(reservations)
          .where(eq(reservations.id, input.reservationId))
          .limit(1)

        if (!reservation) return { ok: false, error: "RESERVATION_NOT_FOUND" }
        if (reservation.status !== "confirmed") {
          return { ok: false, error: "RESERVATION_NOT_CONFIRMED" }
        }

        const totalTtc = parseFloat(reservation.tndAmount)
        const payload =
          (reservation.providerPayload as Record<string, unknown> | null) ?? {}
        const label =
          typeof payload.offerLabel === "string"
            ? payload.offerLabel
            : `Réservation ${reservation.module}`

        try {
          // Savepoint (transaction imbriquée) : si l'INSERT échoue sur le
          // conflit d'unicité, seul ce sous-bloc est annulé — la transaction
          // externe `tx` reste utilisable pour la relecture ci-dessous. Sans
          // savepoint, Postgres marque toute la transaction "aborted" après
          // la première erreur et le SELECT de relecture échoue à son tour.
          const created = await tx.transaction(async (tx2) => {
            const invoiceNumber = await nextInvoiceNumber(tx2, input.agencyId)
            const [row] = await tx2
              .insert(partnerInvoices)
              .values({
                agencyId: input.agencyId,
                invoiceNumber,
                invoiceType: "facture",
                validationDate: new Date().toISOString().slice(0, 10),
                reservationId: input.reservationId,
                lineItems: [
                  { reservationId: input.reservationId, label, amount: totalTtc },
                ],
                totalHt: totalTtc.toFixed(2),
                totalTva: "0.00",
                totalTtc: totalTtc.toFixed(2),
                amountPaid: totalTtc.toFixed(2),
                status: "paid",
              })
              .returning({
                id: partnerInvoices.id,
                invoiceNumber: partnerInvoices.invoiceNumber,
              })
            return row
          })

          return {
            ok: true,
            invoiceId: created.id,
            invoiceNumber: created.invoiceNumber,
            alreadyExisted: false,
          }
        } catch (err) {
          // 23505 = unique_violation — un appel concurrent a déjà créé la
          // facture (reservation_id OU invoice_number) : on relit la sienne
          // plutôt que d'échouer, c'est la définition même de l'idempotence.
          if (pgErrorCode(err) !== "23505") throw err

          const [existing] = await tx
            .select({
              id: partnerInvoices.id,
              invoiceNumber: partnerInvoices.invoiceNumber,
            })
            .from(partnerInvoices)
            .where(eq(partnerInvoices.reservationId, input.reservationId))
            .limit(1)

          if (!existing) throw err
          return {
            ok: true,
            invoiceId: existing.id,
            invoiceNumber: existing.invoiceNumber,
            alreadyExisted: true,
          }
        }
      },
    )
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erreur interne",
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Lecture pour rendu PDF (Phase 21.2)                                        */
/* -------------------------------------------------------------------------- */

export interface InvoiceRecordForReservation {
  invoiceNumber: string
  validationDate: string | null
  totalHt: string
  totalTva: string
  totalTtc: string
}

/**
 * Lit la facture déjà émise pour une réservation, si elle existe.
 * `generateInvoiceForReservation` ne crée une facture QUE pour une
 * réservation `confirmed` (donc, depuis Phase 21.1, FULLY_PAID) — l'absence
 * de ligne ici signifie simplement "pas encore facturée" (paiement partiel
 * ou non confirmée), jamais une seconde logique de calcul : ce n'est
 * qu'une lecture de l'enregistrement déjà écrit par `generateInvoiceForReservation`.
 */
export async function findInvoiceForReservation(
  tx: DrizzleTransaction,
  reservationId: string,
): Promise<InvoiceRecordForReservation | null> {
  const [row] = await tx
    .select({
      invoiceNumber: partnerInvoices.invoiceNumber,
      validationDate: partnerInvoices.validationDate,
      totalHt: partnerInvoices.totalHt,
      totalTva: partnerInvoices.totalTva,
      totalTtc: partnerInvoices.totalTtc,
    })
    .from(partnerInvoices)
    .where(eq(partnerInvoices.reservationId, reservationId))
    .limit(1)
  return row ?? null
}

/* -------------------------------------------------------------------------- */
/* Lecture                                                                     */
/* -------------------------------------------------------------------------- */

export interface PartnerInvoiceRow {
  id: string
  invoiceNumber: string
  invoiceType: string
  validationDate: string | null
  totalHt: string
  totalTva: string
  totalTtc: string
  amountPaid: string
  status: string
  reservationId: string | null
}

export interface AdminInvoiceRow extends PartnerInvoiceRow {
  agencyId: string
  agencyName: string | null
}

export async function listPartnerInvoices(
  agencyId: string,
  actorUserId: string,
): Promise<PartnerInvoiceRow[]> {
  if (!process.env.DATABASE_URL) return []

  const rows = await withTenantContext(
    { agencyId, userId: actorUserId, isSuperAdmin: false },
    (tx) =>
      tx
        .select({
          id: partnerInvoices.id,
          invoiceNumber: partnerInvoices.invoiceNumber,
          invoiceType: partnerInvoices.invoiceType,
          validationDate: partnerInvoices.validationDate,
          totalHt: partnerInvoices.totalHt,
          totalTva: partnerInvoices.totalTva,
          totalTtc: partnerInvoices.totalTtc,
          amountPaid: partnerInvoices.amountPaid,
          status: partnerInvoices.status,
          reservationId: partnerInvoices.reservationId,
        })
        .from(partnerInvoices)
        .where(eq(partnerInvoices.agencyId, agencyId))
        .orderBy(desc(partnerInvoices.createdAt)),
  )

  return rows
}

/**
 * Vue Master Admin (Phase 18) — même requête que `listPartnerInvoices`,
 * étendue au nom d'agence pour un affichage cross-agence. `agencyId: null`
 * = toutes les agences (super_admin uniquement, RLS via `is_super_admin()`) ;
 * fourni = une seule agence (manager/agent_compta, scope déjà appliqué par
 * `withTenantContext`).
 */
export async function listAdminInvoices(
  agencyId: string | null,
  actorUserId: string,
  isSuperAdmin: boolean,
): Promise<AdminInvoiceRow[]> {
  if (!process.env.DATABASE_URL) return []

  const rows = await withTenantContext({ agencyId, userId: actorUserId, isSuperAdmin }, (tx) =>
    tx
      .select({
        id: partnerInvoices.id,
        invoiceNumber: partnerInvoices.invoiceNumber,
        invoiceType: partnerInvoices.invoiceType,
        validationDate: partnerInvoices.validationDate,
        totalHt: partnerInvoices.totalHt,
        totalTva: partnerInvoices.totalTva,
        totalTtc: partnerInvoices.totalTtc,
        amountPaid: partnerInvoices.amountPaid,
        status: partnerInvoices.status,
        reservationId: partnerInvoices.reservationId,
        agencyId: partnerInvoices.agencyId,
        agencyName: agencies.name,
      })
      .from(partnerInvoices)
      .leftJoin(agencies, eq(agencies.id, partnerInvoices.agencyId))
      .where(agencyId ? eq(partnerInvoices.agencyId, agencyId) : undefined)
      .orderBy(desc(partnerInvoices.createdAt))
      .limit(200),
  )

  return rows
}
