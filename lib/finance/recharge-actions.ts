"use server"

/**
 * Server Actions — Recharge Wallet B2B.
 *
 * Deux flux :
 *   1. Agent B2B soumet une demande de recharge (montant + méthode + justificatif)
 *   2. Admin valide la demande → crédite le wallet + crée un mouvement
 *
 * Méthodes supportées :
 *   - cash (espèces à l'agence)
 *   - bank_transfer (virement bancaire)
 *   - postal_transfer (virement postal CCP / La Poste)
 *   - postal_mandate (mandat postal)
 *   - check (chèque)
 *   - card_international (CB Stripe — anticipé, pas encore actif)
 */

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { getDb } from "@/lib/db/client"
import {
  agencies,
  walletRechargeRequests,
  partnerCreditMovements,
  users,
} from "@/lib/db/schema"
import { createServerSupabase } from "@/lib/supabase/server"

/* -------------------------------------------------------------------------- */
/* Auth helpers                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Vérifie que l'appelant courant est un `super_admin`.
 * Retourne `null` si OK, ou un `ActionResult` d'erreur à retourner immédiatement.
 */
async function assertSuperAdmin(): Promise<ActionResult | null> {
  try {
    const supabase = await createServerSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: "Non authentifié" }

    const db = getDb()
    const [actor] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1)

    if (!actor || actor.role !== "super_admin") {
      return { ok: false, error: "Accès refusé : rôle super_admin requis" }
    }
    return null
  } catch {
    return { ok: false, error: "Erreur de vérification des droits" }
  }
}

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type RechargeMethodType =
  | "cash"
  | "bank_transfer"
  | "postal_transfer"
  | "postal_mandate"
  | "check"
  | "card_international"

export interface SubmitRechargeInput {
  amount: number // TND (ex: 1500.000)
  method: RechargeMethodType
  paymentReference?: string
  proofUrl?: string
  note?: string
  // agencyId et requestedByUserId sont résolus depuis la session serveur
  // Ne pas accepter ces valeurs depuis le client (prévient l'usurpation d'agencyId)
}

export interface ValidateRechargeInput {
  requestId: string
  reviewedByUserId: string
}

export interface RejectRechargeInput {
  requestId: string
  reviewedByUserId: string
  rejectionReason: string
}

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string }

/* -------------------------------------------------------------------------- */
/* 1. Agent B2B — Soumettre une demande de recharge                           */
/* -------------------------------------------------------------------------- */

export async function submitRechargeRequest(
  input: SubmitRechargeInput,
): Promise<ActionResult<{ id: string }>> {
  if (!input.amount || input.amount <= 0) {
    return { ok: false, error: "Le montant doit être supérieur à 0" }
  }

  if (input.amount > 999_999) {
    return { ok: false, error: "Montant maximum dépassé (999 999 TND)" }
  }

  // Résoudre agencyId et userId depuis la session — jamais depuis le client
  let agencyId: string
  let requestedByUserId: string
  try {
    const supabase = await createServerSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: "Non authentifié" }

    const db = getDb()
    const [profile] = await db
      .select({ agencyId: users.agencyId })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1)

    if (!profile) return { ok: false, error: "Profil utilisateur introuvable" }

    agencyId = profile.agencyId
    requestedByUserId = user.id
  } catch {
    return { ok: false, error: "Erreur d'authentification" }
  }

  const db = getDb()

  const [row] = await db
    .insert(walletRechargeRequests)
    .values({
      agencyId,
      requestedByUserId,
      amount: input.amount.toFixed(3),
      method: input.method,
      paymentReference: input.paymentReference ?? null,
      proofUrl: input.proofUrl ?? null,
      note: input.note ?? null,
    })
    .returning({ id: walletRechargeRequests.id })

  if (!row) {
    return { ok: false, error: "Erreur lors de la création de la demande" }
  }

  revalidatePath("/b2b/wallet")
  revalidatePath("/admin/accounting")

  return { ok: true, data: { id: row.id } }
}

/* -------------------------------------------------------------------------- */
/* 2. Admin — Valider une demande de recharge                                 */
/* -------------------------------------------------------------------------- */

export async function validateRechargeRequest(
  input: ValidateRechargeInput,
): Promise<ActionResult> {
  const authErr = await assertSuperAdmin()
  if (authErr) return authErr

  const db = getDb()

  // Récupérer la demande
  const [request] = await db
    .select()
    .from(walletRechargeRequests)
    .where(eq(walletRechargeRequests.id, input.requestId))

  if (!request) {
    return { ok: false, error: "Demande de recharge introuvable" }
  }

  if (request.status !== "pending") {
    return { ok: false, error: `Demande déjà traitée (statut: ${request.status})` }
  }

  const amount = parseFloat(request.amount)

  // Transaction : créditer le wallet + créer mouvement + marquer validé
  await db.transaction(async (tx) => {
    // 1. Lire le solde actuel (avec verrou)
    const [agency] = await tx
      .select({ depositBalance: agencies.depositBalance })
      .from(agencies)
      .where(eq(agencies.id, request.agencyId))
      .for("update")

    if (!agency) throw new Error("Agence introuvable")

    const currentBalance = parseFloat(agency.depositBalance)
    const newBalance = currentBalance + amount

    // 2. Mettre à jour le solde
    await tx
      .update(agencies)
      .set({ depositBalance: newBalance.toFixed(3) })
      .where(eq(agencies.id, request.agencyId))

    // 3. Créer le mouvement de crédit
    await tx.insert(partnerCreditMovements).values({
      agencyId: request.agencyId,
      movementType: "credit",
      amount: amount.toFixed(3),
      balanceAfter: newBalance.toFixed(3),
      reference: `RECHARGE-${request.id.slice(0, 8).toUpperCase()}`,
      description: `Recharge wallet — ${methodLabel(request.method)} ${request.paymentReference ? `(réf: ${request.paymentReference})` : ""}`.trim(),
      createdByUserId: input.reviewedByUserId,
    })

    // 4. Marquer la demande comme validée
    await tx
      .update(walletRechargeRequests)
      .set({
        status: "validated",
        reviewedByUserId: input.reviewedByUserId,
        reviewedAt: new Date(),
      })
      .where(eq(walletRechargeRequests.id, input.requestId))
  })

  revalidatePath("/b2b")
  revalidatePath("/b2b/wallet")
  revalidatePath("/admin/accounting")

  return { ok: true, data: undefined }
}

/* -------------------------------------------------------------------------- */
/* 3. Admin — Rejeter une demande de recharge                                 */
/* -------------------------------------------------------------------------- */

export async function rejectRechargeRequest(
  input: RejectRechargeInput,
): Promise<ActionResult> {
  if (!input.rejectionReason.trim()) {
    return { ok: false, error: "Le motif de refus est obligatoire" }
  }

  const authErr = await assertSuperAdmin()
  if (authErr) return authErr

  const db = getDb()

  const [request] = await db
    .select({ status: walletRechargeRequests.status })
    .from(walletRechargeRequests)
    .where(eq(walletRechargeRequests.id, input.requestId))

  if (!request) {
    return { ok: false, error: "Demande de recharge introuvable" }
  }

  if (request.status !== "pending") {
    return { ok: false, error: `Demande déjà traitée (statut: ${request.status})` }
  }

  await db
    .update(walletRechargeRequests)
    .set({
      status: "rejected",
      reviewedByUserId: input.reviewedByUserId,
      rejectionReason: input.rejectionReason.trim(),
      reviewedAt: new Date(),
    })
    .where(eq(walletRechargeRequests.id, input.requestId))

  revalidatePath("/b2b/wallet")
  revalidatePath("/admin/accounting")

  return { ok: true, data: undefined }
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function methodLabel(method: string): string {
  const labels: Record<string, string> = {
    cash: "Espèces",
    bank_transfer: "Virement bancaire",
    postal_transfer: "Virement postal",
    postal_mandate: "Mandat postal",
    check: "Chèque",
    card_international: "Carte bancaire internationale",
  }
  return labels[method] ?? method
}
