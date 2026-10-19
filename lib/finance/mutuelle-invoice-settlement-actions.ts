"use server"

/**
 * Confirmation de règlement d'une facture Mutuelle B2B2C "issued"
 * (MUTUELLE-INVOICE-SETTLEMENT-01) — ferme le gap trouvé par
 * INVOICE-PAID-STATUS-UNVERIFIED-01 : une facture générée à l'approbation
 * directeur (lib/finance/invoice-actions.ts::generateIssuedInvoiceForReservation)
 * reste "issued"/amountPaid="0" tant qu'aucun règlement réel n'est confirmé
 * ici — jamais automatiquement.
 *
 * Patron repris de lib/finance/manual-payment-actions.ts::verifyManualPayment
 * (même garde de rôle MANUAL_PAYMENT_ALLOWED_ROLES, même discipline
 * "référence vérifiable + trace d'audit avant toute transition de statut") —
 * la mutuelle règle Easy2Book par virement groupé périodique, hors
 * plateforme ; cette action enregistre la preuve de ce règlement une fois
 * reçu, elle ne le capture jamais elle-même (pas de PSP/wallet impliqué).
 *
 * Rôle : staff Easy2Book (super_admin/manager/agent_resa/agent_compta) —
 * PAS le directeur Mutuelle (requireMutuelleProfile), qui n'a aucune
 * visibilité ni autorité sur la facturation Easy2Book elle-même.
 */

import { z } from "zod"
import { eq, and } from "drizzle-orm"
import { withTenantContext } from "@/lib/db/tenant-context"
import { partnerInvoices, auditEvents } from "@/lib/db/schema"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { MANUAL_PAYMENT_ALLOWED_ROLES } from "./manual-payment-logic"

const inputSchema = z.object({
  invoiceId: z.string().uuid(),
  /** Référence vérifiable du règlement reçu (ex. référence virement groupé). */
  reference: z.string().trim().min(3).max(200),
})

export type ConfirmMutuelleInvoiceSettlementInput = z.infer<typeof inputSchema>

export type ConfirmMutuelleInvoiceSettlementResult =
  | { ok: true; invoiceId: string; alreadySettled: boolean }
  | { ok: false; error: string }

/**
 * Logique cœur — transaction DB + garde de statut, sans résolution de
 * session Supabase. Exportée pour test direct (live DB), même patron que
 * recoverMutuelleInvoicesCore (MUTUELLE-CONCURRENCY-COMPLETE-01). Le
 * wrapper "use server" ci-dessous résout la session réelle et le rôle,
 * puis délègue ici avec agencyId/userId déjà vérifiés — jamais appelée
 * directement depuis un composant client.
 */
export async function confirmMutuelleInvoiceSettlementCore(
  agencyId: string,
  userId: string,
  input: ConfirmMutuelleInvoiceSettlementInput,
): Promise<ConfirmMutuelleInvoiceSettlementResult> {
  if (!process.env.DATABASE_URL) {
    return { ok: false, error: "Base de données non configurée" }
  }

  try {
    return await withTenantContext(
      { agencyId, userId, isSuperAdmin: false },
      async (tx) => {
        const [invoice] = await tx
          .select({
            id: partnerInvoices.id,
            status: partnerInvoices.status,
            totalTtc: partnerInvoices.totalTtc,
            reservationId: partnerInvoices.reservationId,
          })
          .from(partnerInvoices)
          .where(eq(partnerInvoices.id, input.invoiceId))
          .for("update")

        if (!invoice) return { ok: false, error: "Facture introuvable." }

        if (invoice.status === "paid") {
          // Idempotent : un second clic/appel sur une facture déjà réglée
          // ne doit jamais échouer ni réécrire quoi que ce soit.
          return { ok: true, invoiceId: invoice.id, alreadySettled: true }
        }
        if (invoice.status !== "issued") {
          return {
            ok: false,
            error: `Statut de facture "${invoice.status}" non réglable depuis cette action (attendu "issued").`,
          }
        }

        await tx
          .update(partnerInvoices)
          .set({
            status: "paid",
            amountPaid: invoice.totalTtc,
            notes: `Réglée — référence : ${input.reference}`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(partnerInvoices.id, invoice.id),
              eq(partnerInvoices.status, "issued"),
            ),
          )

        await tx.insert(auditEvents).values({
          agencyId,
          actorUserId: userId,
          entityType: "partner_invoice",
          entityId: invoice.id,
          action: "mutuelle_invoice.settled",
          diff: {
            reference: input.reference,
            amountSettled: invoice.totalTtc,
            reservationId: invoice.reservationId,
            previousStatus: "issued",
          },
        })

        return { ok: true, invoiceId: invoice.id, alreadySettled: false }
      },
    )
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erreur interne",
    }
  }
}

/**
 * Wrapper "use server" — résout la session Supabase réelle + le rôle
 * staff autorisé, valide l'entrée, puis délègue à
 * confirmMutuelleInvoiceSettlementCore. Seul point d'entrée côté client.
 */
export async function confirmMutuelleInvoiceSettlement(
  raw: ConfirmMutuelleInvoiceSettlementInput,
): Promise<ConfirmMutuelleInvoiceSettlementResult> {
  const parsed = inputSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      error:
        "Entrée invalide : " +
        parsed.error.errors.map((e) => e.message).join(", "),
    }
  }
  const input = parsed.data

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "Session expirée" }

  const profile = await getCurrentAdminProfile(user.id)
  if (!profile?.agencyId) {
    return {
      ok: false,
      error: "Profil administrateur introuvable ou non lié à une agence",
    }
  }
  if (
    !(MANUAL_PAYMENT_ALLOWED_ROLES as readonly string[]).includes(profile.role)
  ) {
    return {
      ok: false,
      error: "Votre rôle n'est pas autorisé à confirmer un règlement.",
    }
  }

  return confirmMutuelleInvoiceSettlementCore(profile.agencyId, user.id, input)
}
