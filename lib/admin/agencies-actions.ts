"use server"

import { revalidatePath } from "next/cache"
import { eq, sql } from "drizzle-orm"
import { getDb } from "@/lib/db/client"
import { agencies, auditEvents } from "@/lib/db/schema"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { logger } from "@/lib/logger"

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

  const db = getDb()
  try {
    await db.transaction(async (tx) => {
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
    })

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

  const db = getDb()
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(agencies)
        .set({
          depositBalance: sql`${agencies.depositBalance} + ${String(amountTnd)}`,
          updatedAt: new Date(),
        })
        .where(eq(agencies.id, agencyId))

      await tx.insert(auditEvents).values({
        agencyId,
        actorUserId: actorId,
        entityType: "agency",
        entityId: agencyId,
        action: "agency.wallet_recharged",
        diff: { amountTnd, note: note ?? null },
      })
    })

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
