"use server"

/**
 * Easy2Book Rewards (Phase 38E) — historique récent des mouvements du
 * client connecté, pour `/compte`. Lecture seule
 * (`listLoyaltyLedgerForCustomer` ne verrouille rien — voir
 * lib/loyalty/rewards-core.ts), jamais un id interne ni la `description`
 * brute (contient l'UUID de réservation) exposés au client — seulement
 * type/bucket/points/date + référence publique de réservation.
 *
 * Même limite d'identité que `getMyLoyaltySummary()` (voir sa doc de tête) :
 * additionne l'historique de TOUTES les lignes `customers` possédées par ce
 * client, fusionné et trié par date, plutôt que de n'en lire qu'une
 * arbitrairement.
 */

import { withTenantContext } from "@/lib/db/tenant-context"
import { guestTenantContext } from "@/lib/hotel-suppliers/tenant/live-resolution"
import { customers } from "@/lib/db/schema"
import { createServerSupabase } from "@/lib/supabase/server"
import { ownedByCurrentCustomer } from "@/lib/booking/customer-identity"
import { listLoyaltyLedgerForCustomer, type LoyaltyLedgerHistoryEntry } from "@/lib/loyalty/rewards-core"

const MAX_HISTORY_ENTRIES = 20

export type LoyaltyHistoryEntryDTO = {
  type: LoyaltyLedgerHistoryEntry["type"]
  bucket: LoyaltyLedgerHistoryEntry["bucket"]
  points: number
  createdAt: string
  reservationPublicRef: string | null
  reservationModule: string | null
}

export type MyLoyaltyHistoryResult =
  | { ok: true; entries: LoyaltyHistoryEntryDTO[] }
  | { ok: false; error: string }

export async function getMyLoyaltyHistory(): Promise<MyLoyaltyHistoryResult> {
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
    const entries = await withTenantContext(tenant, async (tx) => {
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

      const all: LoyaltyLedgerHistoryEntry[] = []
      for (const { id: customerId } of ownedCustomers) {
        const rows = await listLoyaltyLedgerForCustomer(tx, customerId, MAX_HISTORY_ENTRIES)
        all.push(...rows)
      }
      all.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      return all.slice(0, MAX_HISTORY_ENTRIES)
    })

    return {
      ok: true,
      entries: entries.map((e) => ({
        type: e.type,
        bucket: e.bucket,
        points: e.points,
        createdAt: e.createdAt.toISOString(),
        reservationPublicRef: e.reservationPublicRef,
        reservationModule: e.reservationModule,
      })),
    }
  } catch (err) {
    console.error("[getMyLoyaltyHistory]", err)
    return { ok: false, error: "Erreur technique. Veuillez réessayer." }
  }
}
