"use server"

/**
 * Server Action wrapper pour getCrossSellNetworkActivities — nécessaire car
 * hotels/[id]/page.tsx est un Client Component (100% client, hooks React
 * partout) et ne peut pas importer directement des fonctions server-only.
 *
 * NETWORK-CROSSSELL-01.
 */

import { getCrossSellNetworkActivities } from "@/lib/destinations/cross-sell"
import type { CrossSellActivity } from "@/lib/destinations/cross-sell"

export async function fetchNearbyNetworkActivities(
  city: string,
): Promise<CrossSellActivity[]> {
  return getCrossSellNetworkActivities(city)
}
