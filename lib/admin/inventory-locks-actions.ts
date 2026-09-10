"use server"

/**
 * Verrous d'inventaire — vue staff en lecture seule sur `inventory_locks`
 * (`lib/booking/inventory.ts`), fixe un lien de nav mort : "Inventaire
 * Statique" pointait vers /admin/inventory, qui n'a jamais existé.
 *
 * `inventory_locks` est explicitement documenté comme un journal d'AUDIT
 * ("pas utilisé pour la décision", voir la doc de tête de
 * lib/booking/inventory.ts — Redis est la source de vérité pour le verrou
 * lui-même) : cette page ne fait donc que refléter honnêtement ce journal,
 * jamais une décision de verrouillage.
 *
 * Constat fait en construisant cette page, à signaler plutôt qu'à corriger
 * silencieusement (portée trop large pour ce lot) : `acquireLock`/
 * `releaseLock`/`refreshLock`/`checkLock` (lib/booking/inventory.ts) n'ont
 * AUCUN appelant dans le tunnel de réservation réel (hôtel/omra/package/
 * activité) — seul `cleanExpiredLocks()` est utilisé (par le cron de
 * nettoyage). Le moteur existe mais n'est branché nulle part : cette page
 * affichera donc honnêtement une liste vide tant que ça reste le cas.
 */

import { withTenantContext } from "@/lib/db/tenant-context"
import type { InventoryLock } from "@/lib/db/schema"
import { assertProductManager } from "./product-guard"
import { listInventoryLocksCore } from "./inventory-locks-core"

export type ListInventoryLocksResult =
  | { ok: true; locks: InventoryLock[] }
  | { ok: false; error: string }

export async function listInventoryLocks(
  status?: InventoryLock["status"],
): Promise<ListInventoryLocksResult> {
  let ctx
  try {
    ctx = await assertProductManager()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }
  if (!process.env.DATABASE_URL) return { ok: false, error: "Base de données non configurée" }

  try {
    const rows = await withTenantContext(
      { agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false },
      (tx) => listInventoryLocksCore(tx, { agencyId: ctx.agencyId, status }),
    )
    return { ok: true, locks: rows }
  } catch (err) {
    console.error("[listInventoryLocks]", err)
    return { ok: false, error: "Erreur technique. Veuillez réessayer." }
  }
}
