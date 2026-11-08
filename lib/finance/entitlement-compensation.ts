/**
 * CANCEL-FINANCIAL-COHERENCE-01 étape 2b — compensation des droits
 * économiques par rôle à l'annulation (D-02a, docs/ECONOMIC_MODEL.md §4).
 *
 * Décisions Direction appliquées (2026-11-08) :
 *  - T4-D1 = B : annulation GRATUITE → tout est compensé, part Easy2Book
 *    comprise ; la règle « non remboursable » (CANCEL-COMMISSION-POLICY-01)
 *    ne vaut que pour les annulations AVEC frais.
 *  - T4-D2 = B : seuls les droits d'une réservation CONFIRMÉE sont
 *    compensés ; des droits encore 'pending' (jamais confirmée, expirée)
 *    ne sont jamais dus, donc rien à compenser.
 *  - D2b-1 = A : frais réellement retenus INCONNUS → aucune compensation
 *    automatique, trace d'audit « à traiter » pour l'équipe (jamais un
 *    montant de frais supposé).
 *  - D2b-2 : annulation avec frais où Easy2Book garde sa part → le vendeur
 *    la supporte (sa ligne nette devient −part Easy2Book).
 *
 * Périmètre de CE helper : rôles autres qu'`easy2book`. La ligne Easy2Book
 * (et son éventuel débit du wallet plateforme) reste gérée par
 * reverseCommissionOnCancellation, appelée par les mêmes chemins — jamais
 * deux compensations pour la même ligne (index unique 0134 en plus).
 *
 * Ajout seulement : une ligne par droit d'origine (`compensates_id`),
 * montant opposé, statut 'compensated'. Aucune ligne existante modifiée,
 * aucun mouvement d'argent, aucune écriture wallet_ledger.
 */
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import {
  auditEvents,
  economicEntitlements,
  reservations,
} from "@/lib/db/schema"

export interface CompensateEntitlementsInput {
  reservationId: string
  /**
   * Frais réellement retenus par le fournisseur, en TND :
   *  - 0 : annulation gratuite (connue) ;
   *  - > 0 : montant réel facturé (ex. myGo) ;
   *  - null : inconnu → aucune compensation, trace « à traiter » (D2b-1 = A).
   */
  supplierFeeTnd: number | null
  publicRef: string
  actorUserId: string | null
  reason: string
}

export type CompensateEntitlementsResult =
  | { outcome: "compensated"; lines: number }
  | { outcome: "nothing_earned" }
  | { outcome: "fee_unknown_flagged" }

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100

/** Part Easy2Book conservée ? (annulation avec frais + traitement non remboursable). */
export function easy2bookKeepsShare(
  supplierFeeTnd: number,
  e2bTreatment: string | null,
): boolean {
  return supplierFeeTnd > 0 && e2bTreatment === "non_refundable"
}

interface OriginalLine {
  id: string
  role: string
  qualification: string
  amount: number
  status: string
  cancellationTreatment: string | null
  partyType: string
  partyId: string | null
  agreementId: string | null
  ruleId: string | null
}

/**
 * Montant de compensation d'une ligne (négatif ou nul pour une ligne
 * positive). Fonction pure, testée seule.
 */
export function compensationAmount(
  line: Pick<OriginalLine, "role" | "amount">,
  ctx: { supplierFeeTnd: number; e2bKeptTnd: number },
): number {
  if (line.role === "supplier") {
    // Le fournisseur garde les frais réellement facturés, jamais plus que
    // son propre droit.
    const kept = Math.min(Math.max(ctx.supplierFeeTnd, 0), line.amount)
    return round2(-(line.amount - kept))
  }
  if (line.role === "seller") {
    // D2b-2 : le vendeur supporte la part Easy2Book conservée.
    return round2(-line.amount - ctx.e2bKeptTnd)
  }
  // product_owner, partner, discount… : compensation totale (D-02a défaut).
  return round2(-line.amount)
}

export async function compensateEntitlementsOnCancellation(
  tx: DrizzleTransaction,
  input: CompensateEntitlementsInput,
): Promise<CompensateEntitlementsResult> {
  const lines: OriginalLine[] = (
    await tx
      .select({
        id: economicEntitlements.id,
        role: economicEntitlements.role,
        qualification: economicEntitlements.qualification,
        amount: economicEntitlements.amount,
        status: economicEntitlements.status,
        cancellationTreatment: economicEntitlements.cancellationTreatment,
        partyType: economicEntitlements.partyType,
        partyId: economicEntitlements.partyId,
        agreementId: economicEntitlements.agreementId,
        ruleId: economicEntitlements.ruleId,
      })
      .from(economicEntitlements)
      .where(
        and(
          eq(economicEntitlements.reservationId, input.reservationId),
          isNull(economicEntitlements.compensatesId),
        ),
      )
  ).map((l) => ({ ...l, amount: Number.parseFloat(l.amount) }))

  // T4-D2 = B : seuls des droits réellement acquis sont compensés.
  // Un droit déjà compensé (annulation puis remboursement, rejeu) est ignoré :
  // ni seconde ligne, ni trace « à traiter » superflue.
  const done = new Set(
    (
      await tx
        .select({ id: economicEntitlements.compensatesId })
        .from(economicEntitlements)
        .where(
          and(
            eq(economicEntitlements.reservationId, input.reservationId),
            isNotNull(economicEntitlements.compensatesId),
          ),
        )
    ).map((r) => r.id),
  )
  const earned = lines.filter(
    (l) => l.status !== "pending" && l.role !== "easy2book" && !done.has(l.id),
  )
  const e2b = lines.find(
    (l) => l.role === "easy2book" && l.status !== "pending",
  )
  if (earned.length === 0) {
    return lines.some((l) => l.status !== "pending" && l.role !== "easy2book")
      ? { outcome: "compensated", lines: 0 }
      : { outcome: "nothing_earned" }
  }

  if (input.supplierFeeTnd === null) {
    // D2b-1 = A : jamais de frais supposés.
    const [res] = await tx
      .select({ agencyId: reservations.agencyId })
      .from(reservations)
      .where(eq(reservations.id, input.reservationId))
    await tx.insert(auditEvents).values({
      agencyId: res!.agencyId,
      actorUserId: input.actorUserId,
      entityType: "reservation",
      entityId: input.reservationId,
      // audit_events.action est varchar(32) : code court obligatoire.
      action: "entitlements.to_compensate",
      diff: {
        publicRef: input.publicRef,
        reason: input.reason,
        note: "Frais réellement retenus inconnus — compensation des droits à traiter manuellement (D2b-1 = A).",
        lines: earned.map((l) => ({
          id: l.id,
          role: l.role,
          amount: l.amount,
        })),
      },
    })
    return { outcome: "fee_unknown_flagged" }
  }

  const fee = input.supplierFeeTnd
  const e2bKeptTnd =
    e2b && easy2bookKeepsShare(fee, e2b.cancellationTreatment) ? e2b.amount : 0

  let written = 0
  for (const line of earned) {
    const amount = compensationAmount(line, { supplierFeeTnd: fee, e2bKeptTnd })
    const inserted = await tx.execute<{ id: string }>(sql`
      INSERT INTO economic_entitlements (
        reservation_id, party_type, party_id, role, qualification, amount,
        currency, basis, agreement_id, rule_id, status, effective_at,
        compensates_id
      ) VALUES (
        ${input.reservationId}, ${line.partyType}, ${line.partyId},
        ${line.role}, ${line.qualification}, ${amount.toFixed(2)}, 'TND',
        ${`Compensation annulation ${input.publicRef} (D-02a, frais fournisseur ${fee.toFixed(2)} TND${line.role === "seller" && e2bKeptTnd > 0 ? `, part Easy2Book conservée ${e2bKeptTnd.toFixed(2)} supportée par le vendeur` : ""})`},
        ${line.agreementId}, ${line.ruleId}, 'compensated', now(), ${line.id}
      )
      ON CONFLICT (compensates_id) WHERE compensates_id IS NOT NULL
      DO NOTHING
      RETURNING id
    `)
    const rows = Array.isArray(inserted)
      ? inserted
      : ((inserted as { rows?: unknown[] }).rows ?? [])
    written += rows.length
  }
  return { outcome: "compensated", lines: written }
}
