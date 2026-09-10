/**
 * Marges de vente (`pricing_margins`) — moteur central, PAS un fichier
 * `"use server"` (même leçon Phase 38A que les autres modules `-core.ts`
 * de ce projet).
 *
 * `pricing_margins` est la table RÉELLEMENT utilisée par `applyMargin()`
 * (lib/pro/pricing.ts) dans le flux de réservation réel (lib/booking/
 * actions.ts, lib/booking/guest-actions.ts, lib/cars/pricing.ts,
 * lib/transfers/pricing.ts) — jamais confondre avec `yieldRules`
 * (lib/yield/*), une table distincte et actuellement SANS AUCUN EFFET sur
 * un prix réel (Server Actions construites, jamais appelées par le moteur
 * de recherche/réservation), ni avec `marginRules`/`reservationFinancials`
 * (lib/finance/wallet-service.ts), également sans appelant réel
 * (lib/booking/workflow-pipeline.ts, qui les invoque, n'est lui-même
 * jamais appelé).
 *
 * Jusqu'ici AUCUNE Server Action d'écriture n'existait sur cette table —
 * ni côté partenaire (components/pro/margins-form.tsx affichait déjà,
 * honnêtement, "pas encore disponible" plutôt qu'un faux succès), ni côté
 * admin (/admin/marges gérait par erreur `yieldRules`, sans aucun effet
 * sur les prix réels).
 */

import { and, eq } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import { pricingMargins, type NewPricingMargin } from "@/lib/db/schema"
import type { MarginModule } from "./pricing"

export interface UpsertPricingMarginParams {
  agencyId: string
  module: MarginModule
  marginType: "percent" | "fixed"
  marginValue: number
  isActive: boolean
}

export async function upsertPricingMarginCore(
  tx: DrizzleTransaction,
  params: UpsertPricingMarginParams,
): Promise<{ id: string }> {
  const values: NewPricingMargin = {
    agencyId: params.agencyId,
    module: params.module,
    marginType: params.marginType,
    marginValue: params.marginValue.toFixed(2),
    isActive: params.isActive,
  }

  const [row] = await tx
    .insert(pricingMargins)
    .values(values)
    .onConflictDoUpdate({
      target: [pricingMargins.agencyId, pricingMargins.module],
      set: {
        marginType: values.marginType,
        marginValue: values.marginValue,
        isActive: values.isActive,
        updatedAt: new Date(),
      },
    })
    .returning({ id: pricingMargins.id })

  return { id: row!.id }
}

export async function listPricingMarginsCore(
  tx: DrizzleTransaction,
  params: { agencyId: string },
) {
  return tx
    .select()
    .from(pricingMargins)
    .where(and(eq(pricingMargins.agencyId, params.agencyId)))
}
