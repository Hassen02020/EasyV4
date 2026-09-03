/**
 * Verrous d'inventaire — requête pure, séparée du Server Action gardé par
 * rôle (lib/admin/inventory-locks-actions.ts) pour rester testable contre
 * une vraie transaction DB, même convention que lib/crm/leads-core.ts et
 * lib/favorites/favorites-core.ts.
 */

import { and, desc, eq } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import { inventoryLocks, type InventoryLock } from "@/lib/db/schema"

export async function listInventoryLocksCore(
  tx: DrizzleTransaction,
  params: { agencyId: string; status?: InventoryLock["status"] },
): Promise<InventoryLock[]> {
  return tx
    .select()
    .from(inventoryLocks)
    .where(
      params.status
        ? and(eq(inventoryLocks.agencyId, params.agencyId), eq(inventoryLocks.status, params.status))
        : eq(inventoryLocks.agencyId, params.agencyId),
    )
    .orderBy(desc(inventoryLocks.createdAt))
    .limit(200)
}
