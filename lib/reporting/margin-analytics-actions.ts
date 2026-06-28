/**
 * Frontière Server Actions pour les analytics de marges.
 *
 * `margin-analytics.ts` accède directement à la base (postgres) : il ne doit
 * jamais être importé par un Client Component, sous peine d'embarquer des
 * modules Node (`fs`, `net`, `perf_hooks`) dans le bundle navigateur. Ce
 * fichier porte la directive `"use server"` au niveau module et expose des
 * wrappers asynchrones que les Client Components peuvent appeler en toute
 * sécurité.
 */

"use server"

import {
  getMarginKPIs as getMarginKPIsImpl,
  type MarginKPIs,
} from "./margin-analytics"

export async function getMarginKPIs(
  agencyId: string,
  startDate: Date,
  endDate: Date,
): Promise<MarginKPIs> {
  return getMarginKPIsImpl(agencyId, startDate, endDate)
}
