/**
 * MUTUELLE-BOOKING-01 — création de réservation pour une demande Mutuelle approuvée.
 *
 * Ce fichier est un helper interne (pas de "use server") appelé depuis
 * `requests-actions.ts` à l'intérieur de la transaction d'approbation.
 *
 * Modèle financier Mutuelle B2B2C :
 *  - `supplierPriceTnd` = prix de base fourni par le directeur (basePriceTnd)
 *  - `salePriceTnd`     = basePriceTnd × (1 + markupPercent / 100)
 *  - Marge agence       = salePriceTnd − basePriceTnd
 *  - Commission Easy2Book sur la marge = 0 % par défaut (pas de règle convention
 *    pour l'instant — chantier commission Mutuelle à définir ultérieurement)
 *
 * Traçabilité : `reservations.providerPayload.channel = "mutuelle_b2b2c"` et
 * `providerPayload.mutuelleRequestId` pour relier la réservation à la demande.
 *
 * Règle module : la réservation hérite du `module` de la demande Mutuelle
 * (hotel/package/activity/…), stocké dans `reservationModule` existant ; aucune
 * valeur "mutuelle" n'est ajoutée à l'enum — pas de migration DB nécessaire.
 */

import { eq, sql, and } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import {
  reservations,
  customers,
  mutuelleGroups,
  mutuelleRequests,
  users,
  auditEvents,
  type MutuelleRequest,
  reservationModule,
} from "@/lib/db/schema"
import { recordReservationFinancials } from "@/lib/finance/reservation-financials"
import { creditPlatformCommission } from "@/lib/finance/platform-commission"

export interface CreateMutuelleBookingInTxInput {
  tx: DrizzleTransaction
  /** Demande approuvée (déjà lue + verrouillée en amont par reviewMutuelleRequest). */
  request: Pick<
    MutuelleRequest,
    | "id"
    | "groupId"
    | "memberUserId"
    | "module"
    | "travelStartDate"
    | "travelEndDate"
    | "paxCount"
    | "description"
  >
  /** Email du membre (lu depuis users, passé pour éviter une 2ème requête). */
  memberEmail: string
  /** Nom complet du membre (lu depuis users). */
  memberName: string | null
  /** ID agence d'exécution (depuis mutuelleGroups.executionAgencyId). */
  executionAgencyId: string
  /** Markup de la convention (depuis mutuelleGroups.markupPercent). */
  markupPercent: number
  /** Prix de base TND fourni par le directeur à l'approbation. */
  basePriceTnd: number
  /** ID directeur (pour l'audit). */
  directorUserId: string
  /** agencyId du directeur (pour audit_events RLS). */
  directorAgencyId: string
}

export interface CreateMutuelleBookingResult {
  reservationId: string
  publicRef: string
  totalTnd: number
}

function pad(n: number, w = 6) {
  return String(n).padStart(w, "0")
}

async function nextMutuellePublicRef(
  tx: DrizzleTransaction,
  agencyId: string,
): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `MUT-${year}-`
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
  return `${prefix}${pad(Number.isFinite(max) ? max + 1 : 1)}`
}

/**
 * Crée la réservation Mutuelle dans la transaction fournie.
 * Appelé depuis `reviewMutuelleRequest` quand `decision === "approved"`.
 */
export async function createMutuelleBookingInTx(
  input: CreateMutuelleBookingInTxInput,
): Promise<CreateMutuelleBookingResult> {
  const {
    tx,
    request,
    memberEmail,
    memberName,
    executionAgencyId,
    markupPercent,
    basePriceTnd,
    directorUserId,
    directorAgencyId,
  } = input

  const MODULE_VALUES = reservationModule.enumValues
  if (
    !MODULE_VALUES.includes(request.module as (typeof MODULE_VALUES)[number])
  ) {
    throw new Error(
      `Module "${request.module}" invalide pour la réservation Mutuelle.`,
    )
  }

  // Prix de vente = base × (1 + markup%)
  const salePriceTnd =
    Math.round(basePriceTnd * (1 + markupPercent / 100) * 100) / 100
  const marginAmount = Math.round((salePriceTnd - basePriceTnd) * 100) / 100

  // --- Client (membre) ---
  const nameParts = (memberName ?? "").trim().split(/\s+/)
  const firstName = nameParts[0] || memberEmail.split("@")[0]
  const lastName = nameParts.slice(1).join(" ") || firstName

  const [customer] = await tx
    .insert(customers)
    .values({
      agencyId: executionAgencyId,
      firstName,
      lastName,
      email: memberEmail,
    })
    .returning({ id: customers.id })

  // --- Référence publique MUT-YYYY-NNNNNN ---
  const publicRef = await nextMutuellePublicRef(tx, executionAgencyId)

  // --- Réservation ---
  const [reservation] = await tx
    .insert(reservations)
    .values({
      agencyId: executionAgencyId,
      customerId: customer.id,
      publicRef,
      module: request.module as (typeof MODULE_VALUES)[number],
      source: "internal",
      status: "confirmed",
      confirmedAt: new Date(),
      originalCurrency: "TND",
      originalAmount: String(salePriceTnd),
      tndAmount: String(salePriceTnd),
      depositAmount: String(salePriceTnd),
      depositPaid: "0",
      providerPayload: {
        mutuelleRequestId: request.id,
        groupId: request.groupId,
        travelStartDate: request.travelStartDate,
        travelEndDate: request.travelEndDate,
        paxCount: request.paxCount,
        description: request.description,
        channel: "mutuelle_b2b2c",
        basePriceTnd,
        markupPercent,
      },
    })
    .returning({ id: reservations.id })

  const reservationId = reservation.id

  // --- Financials : base (coût) + markup (marge agence) + commission 0% ---
  const { commissionAmount } = await recordReservationFinancials({
    tx,
    reservationId,
    supplierPriceTnd: basePriceTnd,
    salePriceTnd,
    commissionPercent: 0,
    economicEntitlements: [
      {
        partyType: "agency",
        partyId: executionAgencyId,
        role: "supplier",
        qualification: "supplier_cost",
        amount: basePriceTnd,
        basis: "prix de base Mutuelle fourni par le directeur à l'approbation",
        ruleId: null,
        agreementId: null,
      },
      ...(marginAmount > 0
        ? [
            {
              partyType: "agency" as const,
              partyId: executionAgencyId,
              role: "seller" as const,
              qualification: "seller_margin" as const,
              amount: marginAmount,
              basis: `markup convention Mutuelle (${markupPercent}% × base ${basePriceTnd.toFixed(3)} TND)`,
              ruleId: null,
              agreementId: null,
            },
          ]
        : []),
    ],
  })

  await creditPlatformCommission(tx, {
    reservationId,
    commissionAmount,
    description: `Commission Mutuelle B2B2C — réservation ${publicRef}`,
  })

  // --- Audit ---
  await tx.insert(auditEvents).values({
    agencyId: directorAgencyId,
    actorUserId: directorUserId,
    entityType: "reservation",
    entityId: reservationId,
    action: "mutuelle_booking.created",
    diff: {
      mutuelleRequestId: request.id,
      publicRef,
      basePriceTnd,
      salePriceTnd,
      markupPercent,
      module: request.module,
      channel: "mutuelle_b2b2c",
    },
  })

  return { reservationId, publicRef, totalTnd: salePriceTnd }
}
