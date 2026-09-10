"use server"

/**
 * Easy2Book Rewards (Phase 38D) — solde fidélité du client connecté, pour
 * `/compte`. Lecture seule (`getLoyaltyAccountSummary` ne verrouille rien —
 * voir lib/loyalty/rewards-core.ts).
 *
 * Même limite d'identité que `listMyReservations()` (voir sa doc de tête) :
 * un client B2C peut avoir PLUSIEURS lignes `customers` (une par réservation
 * pour Package/Activity/Omra, qui n'utilisent pas le find-or-create — seul
 * Hôtel le fait via `resolveOrCreateLinkedCustomer`). `loyalty_accounts`
 * étant unique par `customer_id`, on additionne ici les comptes de TOUTES
 * les lignes `customers` possédées par ce client (même règle de possession
 * que `ownedByCurrentCustomer` — authUserId OU email vérifié), plutôt que de
 * n'en lire qu'une arbitrairement.
 */

import { withTenantContext } from "@/lib/db/tenant-context"
import { guestTenantContext } from "@/lib/hotel-suppliers/tenant/live-resolution"
import { customers } from "@/lib/db/schema"
import { createServerSupabase } from "@/lib/supabase/server"
import { ownedByCurrentCustomer } from "@/lib/booking/customer-identity"
import { getLoyaltyAccountSummary } from "@/lib/loyalty/rewards-core"

export type MyLoyaltySummaryResult =
  | {
      ok: true
      pendingPoints: number
      availablePoints: number
      lifetimeEarnedPoints: number
      lifetimeRedeemedPoints: number
    }
  | { ok: false; error: string }

export async function getMyLoyaltySummary(): Promise<MyLoyaltySummaryResult> {
  if (!process.env.DATABASE_URL) {
    return { ok: false, error: "Service temporairement indisponible." }
  }

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email) {
    return { ok: false, error: "NOT_AUTHENTICATED" }
  }

  const tenant = await guestTenantContext()
  if (!tenant) {
    return { ok: false, error: "Aucune agence n'est configurée pour ce site." }
  }

  try {
    const totals = await withTenantContext(tenant, async (tx) => {
      const ownedCustomers = await tx
        .select({ id: customers.id })
        .from(customers)
        .where(
          ownedByCurrentCustomer({
            agencyId: tenant.agencyId ?? "",
            authUserId: user.id,
            verifiedEmail: user.email!,
          }),
        )

      let pendingPoints = 0
      let availablePoints = 0
      let lifetimeEarnedPoints = 0
      let lifetimeRedeemedPoints = 0
      for (const { id: customerId } of ownedCustomers) {
        const account = await getLoyaltyAccountSummary(tx, customerId)
        if (!account) continue
        pendingPoints += account.pendingPoints
        availablePoints += account.availablePoints
        lifetimeEarnedPoints += account.lifetimeEarnedPoints
        lifetimeRedeemedPoints += account.lifetimeRedeemedPoints
      }
      return { pendingPoints, availablePoints, lifetimeEarnedPoints, lifetimeRedeemedPoints }
    })

    return { ok: true, ...totals }
  } catch (err) {
    console.error("[getMyLoyaltySummary]", err)
    return { ok: false, error: "Erreur technique. Veuillez réessayer." }
  }
}
