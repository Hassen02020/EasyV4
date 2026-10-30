import "server-only"

/**
 * SITE-PROMO-BANNERS-01 — lectures admin de /admin/site. Contrairement à
 * getPublicPromotions (site public : actives et dans leurs dates
 * seulement), l'admin voit TOUTES les promotions, y compris programmées,
 * expirées et désactivées — sinon une promotion désactivée disparaissait de
 * l'admin et ne pouvait plus être réactivée.
 */

import { withTenantContext } from "@/lib/db/tenant-context"
import { listAdminPromotionsCore } from "@/lib/public/site-admin-core"
import { assertProductManager } from "./product-guard"

export async function listAdminPromotions() {
  const ctx = await assertProductManager()
  return withTenantContext(
    { agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false },
    (tx) => listAdminPromotionsCore(tx, ctx.agencyId),
  )
}
