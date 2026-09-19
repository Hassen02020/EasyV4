"use server"

import { revalidatePath } from "next/cache"
import { eq, sql } from "drizzle-orm"
import { z } from "zod"
import { withTenantContext } from "@/lib/db/tenant-context"
import { agencies, auditEvents, partnerCreditMovements } from "@/lib/db/schema"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { logger } from "@/lib/logger"
import { sendEvent } from "@/lib/inngest/client"
import { pgErrorCode } from "@/lib/db/pg-error"

/* -------------------------------------------------------------------------- */
/* Guard super_admin                                                            */
/* -------------------------------------------------------------------------- */

async function assertSuperAdmin(): Promise<string> {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("NOT_AUTHENTICATED")

  const profile = await getCurrentAdminProfile(user.id)
  if (profile?.role !== "super_admin") throw new Error("FORBIDDEN")
  return user.id
}

/* -------------------------------------------------------------------------- */
/* Types                                                                        */
/* -------------------------------------------------------------------------- */

export type AgencyActionResult =
  | { ok: true }
  | { ok: false; error: string }

/* -------------------------------------------------------------------------- */
/* Création                                                                     */
/* -------------------------------------------------------------------------- */

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 64)
}

const createAgencyInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  agencyType: z.enum(["ota", "partner"]),
  contactEmail: z.string().trim().email().max(320).optional().or(z.literal("")),
  contactPhone: z.string().trim().max(32).optional().or(z.literal("")),
})

export type CreateAgencyResult =
  | { ok: true; agencyId: string }
  | { ok: false; error: string }

/**
 * Création réelle d'une agence — jusqu'ici le bouton "Nouvelle Agence" de
 * `/admin/agencies` était `disabled` ("Pas encore disponible"). Périmètre
 * volontairement minimal (nom + type + contact) : les autres champs
 * (`domain`, `logoUrl`, `primaryColor`, devises, TVA, tolérance de
 * réservation…) ont déjà des defaults DB raisonnables et des actions
 * dédiées existantes (`setAgencyReservationTolerance`, White Label) pour
 * les ajuster ensuite — pas besoin de les dupliquer dans le formulaire de
 * création. La création du premier utilisateur (`partner_owner`/staff) de
 * cette agence reste un second pas volontairement séparé (mêmes actions
 * existantes que pour toute agence), jamais fusionné ici.
 */
export async function createAgency(
  raw: z.infer<typeof createAgencyInputSchema>,
): Promise<CreateAgencyResult> {
  const parsed = createAgencyInputSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: "Entrée invalide : " + parsed.error.errors.map((e) => e.message).join(", ") }
  }
  const input = parsed.data

  let actorId: string
  try {
    actorId = await assertSuperAdmin()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }

  if (!process.env.DATABASE_URL)
    return { ok: false, error: "Base de données non configurée" }

  const baseSlug = slugify(input.name)
  if (!baseSlug) return { ok: false, error: "Nom invalide (aucun caractère alphanumérique)." }

  try {
    const newAgencyId = await withTenantContext(
      { agencyId: null, userId: actorId, isSuperAdmin: true },
      async (tx) => {
        // Pas de SELECT-puis-INSERT pour l'unicité du slug (course possible
        // entre deux créations concurrentes) — on tente le slug de base puis,
        // sur 23505 réel, on rejoue avec un suffixe court plutôt que
        // d'échouer platement (une agence nommée deux fois n'est pas un cas
        // limite, ex. "Agence Tunis" créée dans deux villes différentes).
        for (let attempt = 0; attempt < 5; attempt++) {
          const slug = attempt === 0 ? baseSlug : `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`
          try {
            const [created] = await tx
              .insert(agencies)
              .values({
                slug,
                name: input.name,
                agencyType: input.agencyType,
                contactEmail: input.contactEmail || undefined,
                contactPhone: input.contactPhone || undefined,
              })
              .returning({ id: agencies.id })

            await tx.insert(auditEvents).values({
              agencyId: created.id,
              actorUserId: actorId,
              entityType: "agency",
              entityId: created.id,
              action: "agency.created",
              diff: { name: input.name, agencyType: input.agencyType, slug },
            })

            return created.id
          } catch (err) {
            if (pgErrorCode(err) === "23505" && attempt < 4) continue
            throw err
          }
        }
        throw new Error("SLUG_CONFLICT")
      },
    )

    revalidatePath("/admin/agencies")
    logger.info("[agencies-actions] agency created", { agencyId: newAgencyId, actorId })
    return { ok: true, agencyId: newAgencyId }
  } catch (e) {
    logger.error("[agencies-actions] createAgency failed", { err: e instanceof Error ? e.message : String(e) })
    return { ok: false, error: e instanceof Error ? e.message : "Erreur inconnue" }
  }
}

/* -------------------------------------------------------------------------- */
/* suspend / activate                                                           */
/* -------------------------------------------------------------------------- */

export async function setAgencyStatus(
  agencyId: string,
  status: "active" | "suspended",
): Promise<AgencyActionResult> {
  let actorId: string
  try {
    actorId = await assertSuperAdmin()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }

  if (!process.env.DATABASE_URL)
    return { ok: false, error: "Base de données non configurée" }

  try {
    // super_admin agit potentiellement sur une agence différente de la
    // sienne (n'importe quelle agence de la plateforme) : is_super_admin=true
    // requis, la vue n'est pas scopée à une seule agence.
    await withTenantContext(
      { agencyId: null, userId: actorId, isSuperAdmin: true },
      async (tx) => {
        const [updated] = await tx
          .update(agencies)
          .set({ status, updatedAt: new Date() })
          .where(eq(agencies.id, agencyId))
          .returning({ id: agencies.id })

        if (!updated) throw new Error("AGENCY_NOT_FOUND")

        await tx.insert(auditEvents).values({
          agencyId,
          actorUserId: actorId,
          entityType: "agency",
          entityId: agencyId,
          action: status === "active" ? "agency.activated" : "agency.suspended",
          diff: { status },
        })
      },
    )

    revalidatePath("/admin/agencies")
    logger.info("[agencies-actions] status updated", { agencyId, status, actorId })
    return { ok: true }
  } catch (e) {
    logger.error("[agencies-actions] setAgencyStatus failed", { agencyId, status, err: e instanceof Error ? e.message : String(e) })
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Erreur inconnue",
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Tolérance de réservation (booking_capacity = deposit_balance + tolérance)   */
/* -------------------------------------------------------------------------- */

export async function setAgencyReservationTolerance(
  agencyId: string,
  toleranceTnd: number,
): Promise<AgencyActionResult> {
  let actorId: string
  try {
    actorId = await assertSuperAdmin()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }

  if (!process.env.DATABASE_URL)
    return { ok: false, error: "Base de données non configurée" }

  if (toleranceTnd < 0 || toleranceTnd > 999_999)
    return { ok: false, error: "Tolérance invalide (0 – 999 999 TND)" }

  try {
    await withTenantContext(
      { agencyId: null, userId: actorId, isSuperAdmin: true },
      async (tx) => {
        // Seul canal autorisé — voir set_agency_reservation_tolerance()
        // (drizzle/manual/0053_wallet_settlement_unification.sql), même
        // convention que set_agency_deposit_balance() (migration 0020).
        await tx.execute(
          sql`SELECT set_agency_reservation_tolerance(${agencyId}::uuid, ${toleranceTnd.toFixed(3)}::numeric)`,
        )

        await tx.insert(auditEvents).values({
          agencyId,
          actorUserId: actorId,
          entityType: "agency",
          entityId: agencyId,
          action: "agency.reservation_tolerance_set",
          diff: { toleranceTnd },
        })
      },
    )

    revalidatePath("/admin/agencies")
    logger.info("[agencies-actions] reservation tolerance set", { agencyId, toleranceTnd, actorId })
    return { ok: true }
  } catch (e) {
    logger.error("[agencies-actions] setAgencyReservationTolerance failed", {
      agencyId,
      toleranceTnd,
      err: e instanceof Error ? e.message : String(e),
    })
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Erreur inconnue",
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Recharge manuelle du solde wallet                                            */
/* -------------------------------------------------------------------------- */

export async function adminRechargeWallet(
  agencyId: string,
  amountTnd: number,
  note?: string,
): Promise<AgencyActionResult> {
  let actorId: string
  try {
    actorId = await assertSuperAdmin()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }

  if (!process.env.DATABASE_URL)
    return { ok: false, error: "Base de données non configurée" }

  if (amountTnd <= 0 || amountTnd > 999_999)
    return { ok: false, error: "Montant invalide (1 – 999 999 TND)" }

  let movementId: string | null = null
  let newBalanceForNotify = 0

  try {
    await withTenantContext(
      { agencyId: null, userId: actorId, isSuperAdmin: true },
      async (tx) => {
        // Solde relu et verrouillé (`FOR UPDATE`) DANS la transaction, comme
        // `validateRechargeRequest` : évite une double-recharge concurrente
        // et rend `newBalance` disponible en JS pour le mouvement de ledger.
        const [agency] = await tx
          .select({ depositBalance: agencies.depositBalance })
          .from(agencies)
          .where(eq(agencies.id, agencyId))
          .for("update")

        if (!agency) throw new Error("AGENCY_NOT_FOUND")

        const currentBalance = parseFloat(agency.depositBalance)
        const newBalance = currentBalance + amountTnd

        // Seul canal autorisé pour écrire `agencies.deposit_balance` — voir
        // drizzle/manual/0020_agency_wallet_balance_write_gap.sql. Ce chemin
        // tourne déjà en isSuperAdmin: true donc n'était pas cassé comme
        // debitPartnerCredit, mais un seul canal sanctionné pour tout le
        // monde évite qu'un futur appelant reproduise le même bug s'il
        // oublie de poser isSuperAdmin: true.
        await tx.execute(
          sql`SELECT set_agency_deposit_balance(${agencyId}::uuid, ${newBalance.toFixed(3)}::numeric)`,
        )

        // Mouvement de ledger — sans cette ligne, `partner_credit_movements`
        // ne reflète plus la totalité des mouvements réels du solde (gap
        // trouvé en audit : cette recharge directe n'écrivait auparavant
        // qu'un audit_event, jamais de mouvement de crédit traçable).
        const [movement] = await tx
          .insert(partnerCreditMovements)
          .values({
            agencyId,
            movementType: "credit",
            amount: amountTnd.toFixed(3),
            balanceAfter: newBalance.toFixed(3),
            reference: `ADMIN-RECHARGE-${Date.now().toString(36).toUpperCase()}`,
            description: `Recharge directe admin${note ? ` — ${note}` : ""}`,
            createdByUserId: actorId,
          })
          .returning({ id: partnerCreditMovements.id })

        movementId = movement.id
        newBalanceForNotify = newBalance

        await tx.insert(auditEvents).values({
          agencyId,
          actorUserId: actorId,
          entityType: "agency",
          entityId: agencyId,
          action: "agency.wallet_recharged",
          diff: { amountTnd, note: note ?? null, balanceAfter: newBalance },
        })
      },
    )

    // --- Événement Inngest (hors transaction, fire-and-forget) ---
    if (movementId) {
      await sendEvent("wallet/credited", {
        agencyId,
        txId: movementId,
        amount: amountTnd,
        newBalance: newBalanceForNotify,
        method: "ADMIN_DIRECT",
        adminUserId: actorId,
      }).catch(() => { /* fire-and-forget — le retry Inngest suffira */ })
    }

    revalidatePath("/admin/agencies")
    logger.info("[agencies-actions] wallet recharged", { agencyId, amountTnd, actorId })
    return { ok: true }
  } catch (e) {
    logger.error("[agencies-actions] adminRechargeWallet failed", { agencyId, amountTnd, err: e instanceof Error ? e.message : String(e) })
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Erreur inconnue",
    }
  }
}
