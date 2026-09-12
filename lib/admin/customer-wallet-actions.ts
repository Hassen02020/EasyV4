"use server"

/**
 * Crédit direct Master Admin du wallet d'un client B2C — analogue de
 * `lib/admin/agencies-actions.ts::adminRechargeWallet` (crédit agence sans
 * paiement réel), pour le côté client : geste commercial, résolution de
 * litige, etc. Passe par `creditCustomerWallet` (`source: "adjustment"`),
 * le seul canal réel pour un crédit sans règlement derrière (voir garde de
 * lib/finance/customer-wallet.ts).
 */

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { withTenantContext } from "@/lib/db/tenant-context"
import { customers, auditEvents } from "@/lib/db/schema"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { logger } from "@/lib/logger"
import { creditCustomerWallet } from "@/lib/finance/customer-wallet"

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

export type CustomerWalletActionResult = { ok: true } | { ok: false; error: string }

export async function adminCreditCustomerWallet(
  customerId: string,
  amountTnd: number,
  note?: string,
): Promise<CustomerWalletActionResult> {
  let actorId: string
  try {
    actorId = await assertSuperAdmin()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }

  if (!process.env.DATABASE_URL) {
    return { ok: false, error: "Base de données non configurée" }
  }

  if (amountTnd <= 0 || amountTnd > 999_999) {
    return { ok: false, error: "Montant invalide (1 – 999 999 TND)" }
  }

  try {
    let customerAgencyId: string | null = null

    // super_admin agit potentiellement sur un client de n'importe quelle
    // agence — isSuperAdmin: true requis, même convention que
    // adminRechargeWallet (agencies-actions.ts).
    await withTenantContext(
      { agencyId: null, userId: actorId, isSuperAdmin: true },
      async (tx) => {
        const [customer] = await tx
          .select({ id: customers.id, agencyId: customers.agencyId })
          .from(customers)
          .where(eq(customers.id, customerId))
          .limit(1)

        if (!customer) throw new Error("CUSTOMER_NOT_FOUND")
        customerAgencyId = customer.agencyId

        const credit = await creditCustomerWallet({
          customerId,
          amountTnd,
          description: `Crédit direct admin${note ? ` — ${note}` : ""}`,
          source: "adjustment",
          txOverride: tx as Parameters<typeof creditCustomerWallet>[0]["txOverride"],
        })
        if (!credit.ok) {
          throw new Error(`WALLET_CREDIT_FAILED: ${credit.message}`)
        }

        await tx.insert(auditEvents).values({
          agencyId: customer.agencyId,
          actorUserId: actorId,
          entityType: "customer",
          entityId: customerId,
          action: "customer.wallet_credited",
          diff: { amountTnd, note: note ?? null, balanceAfter: credit.balanceAfter },
        })
      },
    )

    if (customerAgencyId) revalidatePath("/admin/clients")
    logger.info("[customer-wallet-actions] wallet credited", { customerId, amountTnd, actorId })
    return { ok: true }
  } catch (e) {
    logger.error("[customer-wallet-actions] adminCreditCustomerWallet failed", {
      customerId,
      amountTnd,
      err: e instanceof Error ? e.message : String(e),
    })
    return {
      ok: false,
      error:
        e instanceof Error && e.message === "CUSTOMER_NOT_FOUND"
          ? "Client introuvable."
          : e instanceof Error
            ? e.message
            : "Erreur inconnue",
    }
  }
}
